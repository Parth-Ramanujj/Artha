import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { createLogger } from '../../common/services/logger.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { CloudApiAdapter } from '../../engine/adapters/cloud-api.adapter';
import { BusinessService } from '../business/business.service';
import { NotificationService } from '../conversation/notification.service';
import { ConversationService } from '../conversation/conversation.service';
import { NotificationType } from '../conversation/entities/notification.entity';
import { Session } from '../session/entities/session.entity';
import { AdReferral } from './entities/ad-referral.entity';
import { WaCall } from './entities/wa-call.entity';
import { Invoice, InvoiceItem } from './entities/invoice.entity';
import { readWebhookInsights } from './wa-webhook-insights';
import { buildInvoicePdf, invoiceTotals, rupees } from './invoice-pdf';

const AD_TAG = 'from-ad';
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface CreateInvoiceInput {
  sessionId: string;
  sellerName: string;
  sellerGstin?: string;
  sellerAddress?: string;
  customerName: string;
  phone: string;
  items: InvoiceItem[];
  gstPercent: number;
  status: 'paid' | 'unpaid';
  send: boolean;
}

/**
 * WhatsApp business tools for official numbers: leads from Click-to-WhatsApp ads, the WhatsApp call
 * log and call settings, quality alerts from Meta, and GST invoices sent as PDF.
 */
@Injectable()
export class WaBusinessService {
  private readonly logger = createLogger('WaBusinessService');

  constructor(
    @InjectRepository(AdReferral, 'data') private readonly referrals: Repository<AdReferral>,
    @InjectRepository(WaCall, 'data') private readonly calls: Repository<WaCall>,
    @InjectRepository(Invoice, 'data') private readonly invoices: Repository<Invoice>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    private readonly engines: EngineRegistry,
    private readonly businessService: BusinessService,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly conversations?: ConversationService,
  ) {}

  // ── webhook ──

  /** Called for every Meta webhook; `sessionIds` are the connected numbers it is for. Never throws. */
  async onWebhook(body: Record<string, unknown>, sessionIds: string[]): Promise<void> {
    const sessionId = sessionIds[0];
    if (!sessionId) return;
    try {
      const { referrals, calls, alerts } = readWebhookInsights(body);
      for (const r of referrals) await this.saveReferral(sessionId, r);
      for (const c of calls) await this.saveCall(sessionId, c);
      if (alerts.length) {
        // Template and account events are for the whole WhatsApp account, i.e. every number on it.
        const businessIds = new Set(await Promise.all(sessionIds.map(id => this.businessOf(id))));
        for (const businessId of businessIds)
          for (const a of alerts)
            await this.notifications?.notify(businessId, NotificationType.SYSTEM, a.title, a.message, {
              source: 'meta-quality',
              severe: a.severe,
            });
      }
    } catch (e) {
      this.logger.warn(`Business tools could not read a webhook: ${errText(e)}`);
    }
  }

  private async businessOf(sessionId: string): Promise<string> {
    const s = await this.sessions.findOne({ where: { id: sessionId }, select: { id: true, businessId: true } });
    return s?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  private async saveReferral(sessionId: string, r: ReturnType<typeof readWebhookInsights>['referrals'][number]) {
    const { phoneNumberId: _id, ...data } = r;
    await this.referrals.save(this.referrals.create({ ...data, sessionId }));
    if (!this.conversations) return;
    try {
      const businessId = await this.businessOf(sessionId);
      const conv = await this.conversations.getOrCreateConversation(
        businessId,
        sessionId,
        `${r.phone}@c.us`,
        r.customerName ?? undefined,
      );
      if (!conv.tags?.includes(AD_TAG))
        await this.conversations.updateConversation(conv.id, businessId, { tags: [...(conv.tags ?? []), AD_TAG] });
    } catch (e) {
      this.logger.warn(`Could not tag the ad lead ${r.phone}: ${errText(e)}`);
    }
  }

  private async saveCall(sessionId: string, c: ReturnType<typeof readWebhookInsights>['calls'][number]) {
    const existing = await this.calls.findOne({ where: { callId: c.callId } });
    const row = existing ?? this.calls.create({ sessionId, callId: c.callId, phone: c.phone, direction: c.direction });
    // A late "connect" must not undo a finished call.
    if (existing && c.status === 'ringing') return;
    row.status = c.status;
    row.durationSec = c.durationSec;
    await this.calls.save(row);
    if (c.status === 'missed')
      await this.notifications?.notify(
        await this.businessOf(sessionId),
        NotificationType.SYSTEM,
        `Missed WhatsApp call from +${c.phone}`,
        'Call them back or reply in Chats.',
        { source: 'wa-call', phone: c.phone },
      );
  }

  // ── ads ──

  async adLeads(sessionIds: string[], days: number) {
    const rows = sessionIds.length
      ? await this.referrals.find({
          where: { sessionId: In(sessionIds), createdAt: MoreThanOrEqual(new Date(Date.now() - days * 86_400_000)) },
          order: { createdAt: 'DESC' },
          take: 2000,
        })
      : [];
    const byAd = new Map<
      string,
      {
        key: string;
        headline: string;
        sourceId: string | null;
        sourceUrl: string | null;
        sourceType: string;
        chats: number;
        people: Set<string>;
        lastAt: Date;
      }
    >();
    for (const r of rows) {
      const key = r.sourceId ?? r.sourceUrl ?? r.headline ?? 'unknown';
      const g = byAd.get(key) ?? {
        key,
        headline: r.headline ?? '(no headline)',
        sourceId: r.sourceId,
        sourceUrl: r.sourceUrl,
        sourceType: r.sourceType,
        chats: 0,
        people: new Set<string>(),
        lastAt: r.createdAt,
      };
      g.chats++;
      g.people.add(r.phone);
      byAd.set(key, g);
    }
    return {
      total: rows.length,
      people: new Set(rows.map(r => r.phone)).size,
      ads: [...byAd.values()]
        .map(({ people, ...g }) => ({ ...g, people: people.size }))
        .sort((a, b) => b.chats - a.chats),
      recent: rows.slice(0, 50),
    };
  }

  // ── calls ──

  private cloud(sessionId: string): CloudApiAdapter {
    const engine = this.engines.get(sessionId);
    if (!(engine instanceof CloudApiAdapter))
      throw new BadRequestException('This number is not a running official (Cloud API) number.');
    return engine;
  }

  async callOverview(sessionId: string) {
    let settings: Record<string, unknown> | null = null;
    let settingsError: string | null = null;
    try {
      settings = await this.cloud(sessionId).getCallingSettings();
    } catch (e) {
      settingsError = errText(e);
    }
    const recent = await this.calls.find({ where: { sessionId }, order: { createdAt: 'DESC' }, take: 100 });
    return {
      enabled: settings?.status === 'ENABLED',
      callButtonVisible: settings ? settings.call_icon_visibility !== 'DISABLE_ALL' : false,
      settingsError,
      recent,
      missed: recent.filter(c => c.status === 'missed').length,
    };
  }

  async setCalling(sessionId: string, enabled: boolean, showCallButton: boolean) {
    return { ok: await this.cloud(sessionId).setCallingSettings(enabled, showCallButton) };
  }

  async askCallPermission(sessionId: string, phone: string, text: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) throw new BadRequestException('Enter the full number with country code, e.g. 919876543210');
    const res = await this.cloud(sessionId).sendCallPermissionRequest(`${digits}@c.us`, text);
    return { ok: true, messageId: res.id };
  }

  // ── invoices ──

  async listInvoices(businessId: string) {
    const rows = await this.invoices.find({ where: { businessId }, order: { createdAt: 'DESC' }, take: 200 });
    const last = rows[0];
    return {
      invoices: rows,
      // The seller details are remembered from the last invoice.
      seller: last
        ? { sellerName: last.sellerName, sellerGstin: last.sellerGstin, sellerAddress: last.sellerAddress }
        : null,
    };
  }

  async createInvoice(businessId: string, input: CreateInvoiceInput) {
    const items = input.items.filter(i => i.name.trim() && i.qty > 0 && i.price >= 0);
    if (!items.length) throw new BadRequestException('Add at least one item with a quantity and price.');
    const count = await this.invoices.count({ where: { businessId } });
    const invoice = await this.invoices.save(
      this.invoices.create({
        businessId,
        sessionId: input.sessionId,
        number: `INV-${String(count + 1).padStart(4, '0')}`,
        sellerName: input.sellerName.trim(),
        sellerGstin: input.sellerGstin?.trim().toUpperCase() || null,
        sellerAddress: input.sellerAddress?.trim() || null,
        customerName: input.customerName.trim(),
        phone: input.phone.replace(/\D/g, ''),
        items,
        gstPercent: input.gstPercent,
        totalPaise: invoiceTotals(items, input.gstPercent).totalPaise,
        status: input.status,
      }),
    );
    return input.send ? this.sendInvoice(businessId, invoice.id) : invoice;
  }

  async getInvoice(businessId: string, id: string): Promise<Invoice> {
    const inv = await this.invoices.findOne({ where: { id, businessId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  pdfOf(inv: Invoice): Buffer {
    return buildInvoicePdf({ ...inv, date: inv.createdAt });
  }

  async sendInvoice(businessId: string, id: string): Promise<Invoice> {
    const inv = await this.getInvoice(businessId, id);
    const engine = this.engines.get(inv.sessionId);
    try {
      if (!engine) throw new Error('This WhatsApp number is not connected.');
      await engine.sendDocumentMessage(`${inv.phone}@c.us`, {
        mimetype: 'application/pdf',
        data: this.pdfOf(inv).toString('base64'),
        filename: `${inv.number}.pdf`,
        caption: `${inv.status === 'paid' ? 'Receipt' : 'Invoice'} ${inv.number} · Total ${rupees(inv.totalPaise)}`,
      });
      inv.sentAt = new Date();
      inv.sendError = null;
    } catch (e) {
      const msg = errText(e);
      inv.sendError = (
        /131047|24.?hour|re-?engagement/i.test(msg)
          ? 'Not sent: the customer has not messaged you in the last 24 hours. Ask them to message you, then press Send again.'
          : `Not sent: ${msg}`
      ).slice(0, 300);
    }
    return this.invoices.save(inv);
  }
}

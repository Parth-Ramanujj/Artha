import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Between, In, Not, IsNull, Repository } from 'typeorm';
import { ConsentStatus, ContactConsent } from '../campaign/entities/contact-consent.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { DND_TAG } from '../conversation/dnd';
import { Message, MessageDirection, MessageStatus } from '../message/entities/message.entity';
import { Session } from '../session/entities/session.entity';
import { isValidTimeZone } from '../library/library-rules';
import { SaveGrowthLinkDto, UpdateGrowthSettingsDto } from './dto/growth.dto';
import { GrowthGreetingLog, GrowthLink, GrowthSettings } from './entities/growth.entity';
import { cleanPhone, healthScore, nextDaily, waLink } from './growth-rules';

const MAX_LINKS_PER_BUSINESS = 200;
/** shortcut: compliance buckets at most this many outgoing rows in memory; move to SQL GROUP BY if a business sends more per period. */
const MAX_COMPLIANCE_ROWS = 50_000;

@Injectable()
export class GrowthService {
  constructor(
    @InjectRepository(GrowthSettings, 'data') private readonly settingsRepo: Repository<GrowthSettings>,
    @InjectRepository(GrowthLink, 'data') private readonly links: Repository<GrowthLink>,
    @InjectRepository(GrowthGreetingLog, 'data') private readonly greetingLog: Repository<GrowthGreetingLog>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    @InjectRepository(Message, 'data') private readonly messages: Repository<Message>,
    @InjectRepository(ContactConsent, 'data') private readonly consents: Repository<ContactConsent>,
    @InjectRepository(Conversation, 'data') private readonly conversations: Repository<Conversation>,
  ) {}

  // ── Settings ──

  async getSettings(businessId: string): Promise<GrowthSettings> {
    const found = await this.settingsRepo.findOne({ where: { businessId } });
    if (found) return found;
    return this.settingsRepo.save(
      this.settingsRepo.create({
        businessId,
        birthdayText: 'Happy birthday {name}! 🎉 Wishing you a wonderful year ahead.',
        anniversaryText: 'Happy anniversary {name}! 💐 Thank you for being with us.',
        winbackText: 'Hi {name}, we miss you! Reply to this message if there is anything we can help with.',
      }),
    );
  }

  async updateSettings(businessId: string, dto: UpdateGrowthSettingsDto): Promise<GrowthSettings> {
    const s = await this.getSettings(businessId);
    if (dto.timezone !== undefined && !isValidTimeZone(dto.timezone)) throw new BadRequestException('Unknown timezone');
    if (dto.sessionId) {
      const owned = await this.sessions.exists({ where: { id: dto.sessionId, businessId } });
      if (!owned) throw new BadRequestException('Pick one of your WhatsApp numbers');
    }
    if (dto.ownerPhone !== undefined && dto.ownerPhone && !cleanPhone(dto.ownerPhone)) {
      throw new BadRequestException('Owner phone must be a full number with country code');
    }
    Object.assign(s, dto);
    if (dto.ownerPhone !== undefined) s.ownerPhone = dto.ownerPhone ? (cleanPhone(dto.ownerPhone) ?? '') : '';
    if ((s.summaryEnabled || s.greetingsEnabled) && !s.sessionId) {
      throw new BadRequestException('Pick the WhatsApp number to send from');
    }
    if (s.summaryEnabled && !s.ownerPhone) throw new BadRequestException('Add the owner phone for the daily summary');

    const now = new Date();
    s.summaryNextRunAt = s.summaryEnabled ? nextDaily(s.summaryTime, s.timezone, now) : null;
    s.greetingsNextRunAt = s.greetingsEnabled ? nextDaily(s.greetingTime, s.timezone, now) : null;
    return this.settingsRepo.save(s);
  }

  // ── Links / QR / widget ──

  async listLinks(businessId: string): Promise<GrowthLink[]> {
    return this.links.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  async getLink(businessId: string, id: string): Promise<GrowthLink> {
    const link = await this.links.findOne({ where: { id, businessId } });
    if (!link) throw new NotFoundException('Link not found');
    return link;
  }

  async saveLink(businessId: string, dto: SaveGrowthLinkDto, id?: string): Promise<GrowthLink> {
    const phone = cleanPhone(dto.phone);
    if (!phone) throw new BadRequestException('Phone must be a full number with country code');
    const link = id ? await this.getLink(businessId, id) : null;
    if (!link && (await this.links.count({ where: { businessId } })) >= MAX_LINKS_PER_BUSINESS) {
      throw new BadRequestException(`At most ${MAX_LINKS_PER_BUSINESS} links`);
    }
    const row = link ?? this.links.create({ businessId, ref: randomBytes(4).toString('hex') });
    row.name = dto.name.trim();
    row.phone = phone;
    row.prefillText = (dto.prefillText ?? '').trim();
    return this.links.save(row);
  }

  async deleteLink(businessId: string, id: string): Promise<void> {
    await this.links.remove(await this.getLink(businessId, id));
  }

  /** Public redirect: counts the scan and returns the wa.me URL, built only from the stored row. */
  async scan(ref: string): Promise<string | null> {
    const link = await this.links.findOne({ where: { ref } });
    if (!link) return null;
    await this.links.increment({ id: link.id }, 'scans', 1);
    await this.links.update(link.id, { lastScanAt: new Date() });
    return waLink(link.phone, link.prefillText, link.ref);
  }

  async findLinkByRef(ref: string): Promise<GrowthLink | null> {
    return this.links.findOne({ where: { ref } });
  }

  // ── Greetings history ──

  async recentGreetings(businessId: string): Promise<GrowthGreetingLog[]> {
    return this.greetingLog.find({ where: { businessId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  // ── Compliance ──

  async compliance(businessId: string, days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const sessions = await this.sessions.find({ where: { businessId }, select: { id: true, name: true, phone: true } });
    const ids = sessions.map(s => s.id);

    const outgoing = ids.length
      ? await this.messages.find({
          where: { sessionId: In(ids), direction: MessageDirection.OUTGOING, createdAt: Between(start, end) },
          select: { sessionId: true, status: true, createdAt: true },
          take: MAX_COMPLIANCE_ROWS,
        })
      : [];

    const [optIns, optOuts, dndChats, proof] = await Promise.all([
      this.consents.count({
        where: { businessId, status: ConsentStatus.OPTED_IN, consentedAt: Between(start, end) },
      }),
      this.consents.count({ where: { businessId, revokedAt: Between(start, end) } }),
      this.conversations
        .createQueryBuilder('c')
        .where('c.businessId = :businessId', { businessId })
        .andWhere('c.tags LIKE :tag', { tag: `%"${DND_TAG}"%` })
        .getCount(),
      this.consents.find({
        where: { businessId, status: Not(ConsentStatus.UNKNOWN), source: Not(IsNull()) },
        order: { updatedAt: 'DESC' },
        take: 500,
      }),
    ]);

    const perSession = sessions.map(s => {
      const rows = outgoing.filter(m => m.sessionId === s.id);
      const hours = new Map<number, number>();
      for (const m of rows) {
        const h = Math.floor(new Date(m.createdAt).getTime() / 3_600_000);
        hours.set(h, (hours.get(h) ?? 0) + 1);
      }
      return {
        sessionId: s.id,
        name: s.name,
        phone: s.phone,
        sent: rows.length,
        failed: rows.filter(m => m.status === MessageStatus.FAILED).length,
        peakPerHour: Math.max(0, ...hours.values()),
      };
    });

    const totals = {
      sent: outgoing.length,
      failed: perSession.reduce((n, s) => n + s.failed, 0),
      optIns,
      optOuts,
      peakPerHour: Math.max(0, ...perSession.map(s => s.peakPerHour)),
    };
    return {
      days,
      ...totals,
      dndChats,
      truncated: outgoing.length >= MAX_COMPLIANCE_ROWS,
      health: healthScore(totals),
      sessions: perSession,
      proof: proof.map(c => ({
        waContactId: c.waContactId,
        status: c.status,
        source: c.source,
        consentedAt: c.consentedAt,
        revokedAt: c.revokedAt,
      })),
    };
  }
}

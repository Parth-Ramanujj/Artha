import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { SalesAgentConfig, SalesConversation, SalesOutboxItem, SalesProspect } from './entities/sales-agent.entity';
import type { SalesChannel } from './channels/sales-channel';
import { autopilotHoldReason, preSendProblems, STOP_STATUSES } from './sales-rules';

const MAX_SENDS_PER_CYCLE = 8;
const STUCK_SENDING_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const HELD_PREFIX = 'held for your review: ';

@Injectable()
export class SalesSenderService {
  private readonly logger = new Logger(SalesSenderService.name);
  /** Gap between sends so a burst doesn't look automated; overridable in tests. */
  pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  constructor(
    @InjectRepository(SalesOutboxItem, 'data') private readonly outbox: Repository<SalesOutboxItem>,
    @InjectRepository(SalesProspect, 'data') private readonly prospects: Repository<SalesProspect>,
    @InjectRepository(SalesConversation, 'data') private readonly conversations: Repository<SalesConversation>,
  ) {}

  /** Sends due, approved outbox rows within each channel's daily cap. Returns how many went out. */
  async drain(config: SalesAgentConfig, channels: SalesChannel[], now = new Date()): Promise<number> {
    // A row left in `sending` may or may not have gone out; never retry it blind.
    await this.outbox.update(
      {
        businessId: config.businessId,
        status: 'sending',
        updatedAt: LessThan(new Date(now.getTime() - STUCK_SENDING_MS)),
      },
      { status: 'failed', error: 'may have gone out: the send never finished' },
    );
    if (config.sendingPaused) return 0;

    let sent = 0;
    for (const channel of channels) {
      if (!channel.isReady(config)) continue;
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const sentToday = await this.outbox.count({
        where: {
          businessId: config.businessId,
          channel: channel.name,
          status: 'sent',
          sentAt: MoreThanOrEqual(dayStart),
        },
      });
      let budget = Math.min(MAX_SENDS_PER_CYCLE - sent, channel.dailyCap(config) - sentToday);
      if (budget <= 0) continue;

      const due = await this.outbox.find({
        where: {
          businessId: config.businessId,
          channel: channel.name,
          status: 'approved',
          sendAt: LessThanOrEqual(now),
        },
        // Replies before cold follow-ups ('reply' < 'sequence').
        order: { kind: 'ASC', sendAt: 'ASC' },
        take: budget * 3,
      });
      for (const row of due) {
        if (budget <= 0) break;
        if (!(await this.sendOne(config, channel, row, now))) continue;
        sent++;
        budget--;
        if (budget > 0) await this.pause(4000 + Math.random() * 11000);
      }
    }
    return sent;
  }

  /** Re-checks everything that could have changed since approval, then sends. True when it went out. */
  private async sendOne(config: SalesAgentConfig, channel: SalesChannel, row: SalesOutboxItem, now: Date) {
    const prospect = await this.prospects.findOne({ where: { id: row.prospectId } });
    if (!prospect) return this.close(row, 'cancelled', 'prospect deleted');

    if (row.kind === 'sequence') {
      if (STOP_STATUSES.has(prospect.status)) return this.close(row, 'cancelled', `prospect is ${prospect.status}`);
      if (row.step === 1 && prospect.status === 'contacted') return this.close(row, 'cancelled', 'already contacted');
      if (row.step > 1) {
        const prev = await this.outbox.findOne({
          where: { prospectId: row.prospectId, kind: 'sequence', step: row.step - 1 },
        });
        if (!prev || ['rejected', 'cancelled', 'failed'].includes(prev.status)) {
          return this.close(row, 'cancelled', 'the earlier message was never sent');
        }
        if (prev.status !== 'sent') return false; // waits for the earlier step
        const earliest = (prev.sentAt?.getTime() ?? now.getTime()) + DAY_MS;
        if (now.getTime() < earliest) {
          await this.outbox.update(row.id, { sendAt: new Date(earliest) });
          return false;
        }
      }
    } else if (prospect.status === 'opted_out') {
      return this.close(row, 'cancelled', 'prospect opted out');
    }

    const to = channel.recipientFor(prospect);
    if (!to) return this.close(row, 'failed', `no ${channel.name} address for this prospect`);

    const problems = preSendProblems(channel.name, row.kind, row);
    if (problems.length) return this.close(row, 'failed', `gate: ${problems.join(', ')}`);

    if (row.approvedBy !== 'you') {
      if (config.requireApproval) {
        await this.outbox.update(row.id, { status: 'pending_review', error: 'approval mode is on' });
        return false;
      }
      const allowed = [
        config.persona.website,
        config.product.bookingUrl,
        channel.name === 'email' ? to.split('@')[1] : '',
      ];
      const hold = autopilotHoldReason(row.body, allowed.filter(Boolean));
      if (hold) {
        await this.outbox.update(row.id, { status: 'pending_review', error: HELD_PREFIX + hold });
        return false;
      }
    }

    // Atomic claim: only one worker may move a row to `sending`.
    const claim = await this.outbox.update({ id: row.id, status: 'approved' }, { status: 'sending' });
    if (!claim.affected) return false;

    const footer = channel.footer(config);
    const withFooter = row.kind === 'sequence' && footer && (channel.name === 'email' || row.step === 1);
    const body = withFooter ? `${row.body}\n\n${footer}` : row.body;
    try {
      const res = await channel.send(config, { to, subject: row.subject, body, inReplyTo: row.inReplyTo });
      await this.outbox.update(row.id, {
        status: 'sent',
        sentAt: now,
        providerMessageId: res.messageId.slice(0, 300),
        error: '',
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Send failed for outbox ${row.id}: ${reason}`);
      await this.outbox.update(row.id, { status: 'failed', error: `may have gone out: ${reason}`.slice(0, 1000) });
      return false;
    }

    if (prospect.status === 'new' || prospect.status === 'queued') {
      await this.prospects.update(prospect.id, { status: 'contacted' });
    }
    await this.appendToThread(config, prospect, channel, body);
    return true;
  }

  private async appendToThread(config: SalesAgentConfig, prospect: SalesProspect, channel: SalesChannel, text: string) {
    const conv =
      (await this.conversations.findOne({ where: { prospectId: prospect.id } })) ??
      this.conversations.create({
        businessId: config.businessId,
        prospectId: prospect.id,
        channel: channel.name,
        thread: [],
        stage: 'initial_outreach',
        status: 'open',
      });
    conv.thread = [...conv.thread, { from: 'agent', text, at: new Date().toISOString() }];
    await this.conversations.save(conv);
  }

  private async close(row: SalesOutboxItem, status: 'cancelled' | 'failed', error: string): Promise<false> {
    await this.outbox.update(row.id, { status, error });
    return false;
  }
}

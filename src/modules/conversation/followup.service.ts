import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, IsNull } from 'typeorm';
import { FollowupRule, FollowupTrigger } from './entities/followup-rule.entity';
import { FollowupAttempt } from './entities/followup-attempt.entity';
import { Conversation, ConversationStatus } from './entities/conversation.entity';
import { Deal, DealStage } from './entities/deal.entity';
import { ReminderReason } from './entities/reminder.entity';
import { CreateFollowupRuleDto, UpdateFollowupRuleDto } from './dto/followup-rule.dto';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { DateTransformer } from '../../common/transformers/date.transformer';
import { notDndSql } from './dnd';
import { ReminderService } from './reminder.service';

const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SENDS_PER_TICK = 50;
const CANDIDATE_BATCH = 200;
const SCHEDULABLE_TRIGGERS: string[] = [FollowupTrigger.NO_REPLY, FollowupTrigger.CONVERSATION_IDLE];
const DEFAULT_SEND_AT_MINUTES = 10 * 60;
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
// Sends only within this window after the configured time, so a server that was down all morning
// does not message leads in the evening.
const MORNING_SEND_WINDOW_MINUTES = 180;

// lastInboundAt is stored through DateTransformer (ISO text on SQLite), so bound parameters must use the
// same encoding or SQLite compares strings in two formats.
const toDbDate = (date: Date) => DateTransformer.to(date) as string | Date;

const DEAL_STAGES: string[] = Object.values(DealStage);

/** Deal stage a rule is scoped to (no_reply / conversation_idle only), or null for a plain conversation rule. */
function dealStageOf(rule: FollowupRule): string | null {
  const stage = rule.conditions?.dealStage;
  return typeof stage === 'string' && stage !== '' ? stage : null;
}

/** Message for the nth nudge of a sequence; the last message repeats when the sequence is longer than the list. */
function messageForStep(rule: FollowupRule, step: number): string {
  const messages = rule.conditions?.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    return String(messages[Math.min(step, messages.length - 1)]);
  }
  return rule.message;
}

/** Rejects lifecycle conditions that would silently do nothing, so a typo fails at save time, not never. */
export function assertLifecycleConditions(
  trigger: string,
  conditions: Record<string, unknown> | null | undefined,
): void {
  if (!conditions) return;
  if (conditions.dealStage !== undefined) {
    if (typeof conditions.dealStage !== 'string' || !DEAL_STAGES.includes(conditions.dealStage)) {
      throw new BadRequestException(`conditions.dealStage must be one of: ${DEAL_STAGES.join(', ')}`);
    }
    if (!SCHEDULABLE_TRIGGERS.includes(trigger)) {
      throw new BadRequestException('conditions.dealStage only applies to no_reply and conversation_idle rules');
    }
  }
  if (conditions.messages !== undefined) {
    const ok =
      Array.isArray(conditions.messages) &&
      conditions.messages.length > 0 &&
      conditions.messages.every(m => typeof m === 'string' && m.trim() !== '');
    if (!ok) throw new BadRequestException('conditions.messages must be a non-empty list of non-empty strings');
  }
}

function parseSendAt(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function secondsSinceLocalMidnight(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return get('hour') * 3600 + get('minute') * 60 + get('second');
}

@Injectable()
export class FollowupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FollowupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectRepository(FollowupRule, 'data') private readonly ruleRepo: Repository<FollowupRule>,
    @InjectRepository(FollowupAttempt, 'data') private readonly attemptRepo: Repository<FollowupAttempt>,
    @InjectRepository(Conversation, 'data') private readonly convoRepo: Repository<Conversation>,
    @Optional() private readonly engineRegistry?: EngineRegistry,
    @Optional() private readonly reminders?: ReminderService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runScheduler(), SCHEDULER_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runScheduler(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      const rules = await this.ruleRepo.find({ where: { enabled: true } });
      for (const rule of rules) {
        if (sent >= MAX_SENDS_PER_TICK) break;
        if (rule.trigger === (FollowupTrigger.LEAD_MORNING as string)) {
          await this.markRecoveries(rule);
          sent += await this.sendMorningLeadFollowups(rule, now, MAX_SENDS_PER_TICK - sent);
          continue;
        }
        if (!SCHEDULABLE_TRIGGERS.includes(rule.trigger)) continue;
        await this.markRecoveries(rule);
        sent += await this.sendDueFollowups(rule, now, MAX_SENDS_PER_TICK - sent);
      }
    } catch (error) {
      this.logger.error(`Follow-up scheduler failed: ${error}`);
    } finally {
      this.running = false;
    }
    return sent;
  }

  private async markRecoveries(rule: FollowupRule): Promise<void> {
    const unrecovered = await this.attemptRepo.find({
      where: { ruleId: rule.id, recoveredAt: IsNull() },
      take: CANDIDATE_BATCH,
    });
    if (unrecovered.length === 0) return;

    const conversations = await this.convoRepo.find({
      where: { id: In(unrecovered.map(a => a.conversationId)) },
    });
    const byId = new Map(conversations.map(c => [c.id, c]));

    let recovered = 0;
    for (const attempt of unrecovered) {
      const convo = byId.get(attempt.conversationId);
      if (convo?.lastInboundAt && new Date(convo.lastInboundAt) > new Date(attempt.sentAt)) {
        attempt.recoveredAt = new Date(convo.lastInboundAt);
        await this.attemptRepo.save(attempt);
        recovered++;
        // The customer answered a stage nudge: tell the deal owner to pick it up.
        const dealStage = dealStageOf(rule);
        if (dealStage) {
          await this.raiseReminder(rule, convo, dealStage, ReminderReason.CUSTOMER_REPLIED, attempt.sentAt);
        }
      }
    }
    if (recovered > 0) await this.ruleRepo.increment({ id: rule.id }, 'totalRecovered', recovered);
  }

  private async sendDueFollowups(rule: FollowupRule, now: Date, budget: number): Promise<number> {
    const idleCutoff = new Date(now.getTime() - rule.delayMinutes * 60 * 1000);
    const qb = this.convoRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ConversationStatus.OPEN })
      .andWhere('c.lastMessageAt < :idleCutoff', { idleCutoff: toDbDate(idleCutoff) })
      .andWhere("(c.chatId LIKE '%@c.us' OR c.chatId LIKE '%@lid')")
      .andWhere(notDndSql('c'));
    if (rule.trigger === (FollowupTrigger.NO_REPLY as string)) {
      // "No reply" means the business spoke last and the customer went quiet — never nudge a customer
      // who is still waiting for the business, or one who never wrote at all.
      qb.andWhere('c.lastInboundAt IS NOT NULL').andWhere('c.lastMessageAt > c.lastInboundAt');
    }
    if (rule.businessId) qb.andWhere('c.businessId = :businessId', { businessId: rule.businessId });
    const targetChatIds = rule.conditions?.chatIds;
    if (Array.isArray(targetChatIds)) {
      if (targetChatIds.length === 0) return 0;
      qb.andWhere('c.chatId IN (:...targetChatIds)', { targetChatIds });
    }
    if (rule.sessionId) qb.andWhere('c.sessionId = :sessionId', { sessionId: rule.sessionId });
    const dealStage = dealStageOf(rule);
    if (dealStage) {
      // Only chats whose deal is in this stage, and that has been in it for the idle delay. Won/lost deals
      // and deals that moved on drop out here, which is what ends the sequence for them.
      const inStage = this.convoRepo.manager
        .createQueryBuilder()
        .select('d.conversationId', 'conversationId')
        .from(Deal, 'd')
        .where('d.stage = :dealStage', { dealStage })
        // Legacy deals have no stageChangedAt; they count as having been in the stage since before.
        .andWhere('(d.stageChangedAt IS NULL OR d.stageChangedAt < :stageCutoff)', {
          stageCutoff: toDbDate(idleCutoff),
        });
      if (rule.businessId) inStage.andWhere('d.businessId = :dealBusinessId', { dealBusinessId: rule.businessId });
      qb.andWhere(`c.id IN (${inStage.getQuery()})`).setParameters(inStage.getParameters());
    }
    const candidates = await qb.orderBy('c.lastMessageAt', 'ASC').take(CANDIDATE_BATCH).getMany();

    let sent = 0;
    for (const convo of candidates) {
      if (sent >= budget) break;

      const lastInbound = convo.lastInboundAt ? new Date(convo.lastInboundAt).getTime() : 0;
      const attempts = await this.attemptRepo.find({
        where: { ruleId: rule.id, conversationId: convo.id },
        order: { sentAt: 'DESC' },
      });
      const sequence = attempts.filter(a => new Date(a.sentAt).getTime() > lastInbound);
      const lastAttempt = sequence[0];
      const cooledDown =
        !lastAttempt || now.getTime() - new Date(lastAttempt.sentAt).getTime() >= rule.cooldownMinutes * 60 * 1000;
      if (sequence.length >= rule.maxAttempts) {
        // Sequence used up with no reply: once the last nudge has had its cooldown, hand the chat to staff.
        if (dealStage && lastAttempt && cooledDown) {
          await this.raiseReminder(rule, convo, dealStage, ReminderReason.SEQUENCE_EXHAUSTED, lastAttempt.sentAt);
        }
        continue;
      }
      if (lastAttempt && !cooledDown) continue;

      if (await this.deliver(rule, convo, now, sequence.length)) sent++;
    }
    return sent;
  }

  /** Reminders are a side effect of the follow-up; a failure to raise one must not stop the nudges. */
  private async raiseReminder(
    rule: FollowupRule,
    convo: Conversation,
    dealStage: string,
    reason: ReminderReason.SEQUENCE_EXHAUSTED | ReminderReason.CUSTOMER_REPLIED,
    cycleAt: Date,
  ): Promise<void> {
    if (!this.reminders || !rule.businessId) return;
    try {
      await this.reminders.raiseAutomatic({
        businessId: rule.businessId,
        conversationId: convo.id,
        dealStage,
        sourceRuleId: rule.id,
        reason,
        cycleAt,
      });
    } catch (error) {
      this.logger.warn(`Could not raise ${reason} reminder for ${convo.chatId}: ${error}`);
    }
  }

  // One follow-up per lead, ever: the morning after their last message, if they have not written today.
  private async sendMorningLeadFollowups(rule: FollowupRule, now: Date, budget: number): Promise<number> {
    const timeZone = typeof rule.conditions?.timezone === 'string' ? rule.conditions.timezone : DEFAULT_TIMEZONE;
    const sendAtMinutes = parseSendAt(rule.conditions?.sendAt) ?? DEFAULT_SEND_AT_MINUTES;
    const secondsToday = secondsSinceLocalMidnight(now, timeZone);
    const minutesToday = Math.floor(secondsToday / 60);
    if (minutesToday < sendAtMinutes || minutesToday >= sendAtMinutes + MORNING_SEND_WINDOW_MINUTES) return 0;

    const startOfToday = new Date(now.getTime() - secondsToday * 1000 - now.getMilliseconds());
    const qb = this.convoRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ConversationStatus.OPEN })
      .andWhere("(c.chatId LIKE '%@c.us' OR c.chatId LIKE '%@lid')")
      .andWhere(notDndSql('c'))
      // Leads from before the rule existed are left alone, so enabling it does not message old chats.
      .andWhere('c.lastInboundAt >= :since', { since: toDbDate(new Date(rule.createdAt)) })
      .andWhere('c.lastInboundAt < :startOfToday', { startOfToday: toDbDate(startOfToday) });
    if (rule.businessId) qb.andWhere('c.businessId = :businessId', { businessId: rule.businessId });
    if (rule.sessionId) qb.andWhere('c.sessionId = :sessionId', { sessionId: rule.sessionId });
    const candidates = await qb.orderBy('c.lastInboundAt', 'ASC').take(CANDIDATE_BATCH).getMany();
    if (candidates.length === 0) return 0;

    const alreadySent = await this.attemptRepo.find({
      where: { ruleId: rule.id, conversationId: In(candidates.map(c => c.id)) },
      select: { conversationId: true },
    });
    const done = new Set(alreadySent.map(a => a.conversationId));

    let sent = 0;
    for (const convo of candidates) {
      if (sent >= budget) break;
      if (done.has(convo.id)) continue;
      if (await this.deliver(rule, convo, now)) sent++;
    }
    return sent;
  }

  private async deliver(rule: FollowupRule, convo: Conversation, now: Date, step = 0): Promise<boolean> {
    const engine = this.engineRegistry?.get(convo.sessionId);
    if (!engine) return false;

    const attempt = await this.attemptRepo.save(
      this.attemptRepo.create({
        businessId: rule.businessId,
        ruleId: rule.id,
        conversationId: convo.id,
        sessionId: convo.sessionId,
        chatId: convo.chatId,
        sentAt: now,
        recoveredAt: null,
      }),
    );

    try {
      await engine.sendTextMessage(
        convo.chatId,
        messageForStep(rule, step).replace(/\{\{name\}\}/g, convo.chatName || 'there'),
      );
      await this.ruleRepo.increment({ id: rule.id }, 'totalSent', 1);
      return true;
    } catch (error) {
      await this.attemptRepo.delete(attempt.id);
      this.logger.warn(`Follow-up to ${convo.chatId} failed: ${error}`);
      return false;
    }
  }

  async findAllRules(businessId: string) {
    return this.ruleRepo.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  async findOneRule(id: string, businessId: string) {
    const rule = await this.ruleRepo.findOne({ where: { id, businessId } });
    if (!rule) throw new NotFoundException('Follow-up rule not found');
    return rule;
  }

  async createRule(businessId: string, dto: CreateFollowupRuleDto) {
    assertLifecycleConditions(dto.trigger, dto.conditions);
    const rule = this.ruleRepo.create({ ...dto, businessId });
    return this.ruleRepo.save(rule);
  }

  async updateRule(id: string, businessId: string, dto: UpdateFollowupRuleDto) {
    const rule = await this.findOneRule(id, businessId);
    Object.assign(rule, dto);
    assertLifecycleConditions(rule.trigger, rule.conditions);
    return this.ruleRepo.save(rule);
  }

  async removeRule(id: string, businessId: string) {
    const rule = await this.findOneRule(id, businessId);
    await this.ruleRepo.remove(rule);
  }

  async getDroppedUsers(businessId: string, idleMinutes = 60) {
    const cutoff = new Date(Date.now() - idleMinutes * 60 * 1000);
    const conversations = await this.convoRepo.find({
      where: {
        ...(businessId ? { businessId } : {}),
        status: ConversationStatus.OPEN,
        lastMessageAt: LessThan(cutoff),
      },
      order: { lastMessageAt: 'ASC' },
    });

    return conversations.map(c => ({
      conversationId: c.id,
      chatId: c.chatId,
      chatName: c.chatName,
      sessionId: c.sessionId,
      lastMessageAt: c.lastMessageAt,
      minutesIdle: c.lastMessageAt ? Math.round((Date.now() - new Date(c.lastMessageAt).getTime()) / 60000) : 0,
    }));
  }

  async sendFollowup(businessId: string, conversationId: string, sessionId: string, chatId: string, message: string) {
    const engine = this.engineRegistry?.get(sessionId);
    if (!engine) {
      return { success: false, reason: 'Session not connected' };
    }

    try {
      await engine.sendTextMessage(chatId, message);
      this.logger.log(`Follow-up sent to ${chatId} in session ${sessionId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Follow-up failed: ${error}`);
      return { success: false, reason: String(error) };
    }
  }

  async getStats(businessId: string) {
    const rules = await this.ruleRepo.find({ where: { businessId } });
    const totalRules = rules.length;
    const activeRules = rules.filter(r => r.enabled).length;
    const totalSent = rules.reduce((s, r) => s + r.totalSent, 0);
    const totalRecovered = rules.reduce((s, r) => s + r.totalRecovered, 0);
    const recoveryRate = totalSent > 0 ? Math.round((totalRecovered / totalSent) * 100) : 0;

    return { totalRules, activeRules, totalSent, totalRecovered, recoveryRate };
  }
}

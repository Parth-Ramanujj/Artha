import { DataSource, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { FollowupService, assertLifecycleConditions } from './followup.service';
import { FollowupRule, FollowupTrigger } from './entities/followup-rule.entity';
import { FollowupAttempt } from './entities/followup-attempt.entity';
import { Conversation, ConversationStatus } from './entities/conversation.entity';
import { Deal, DealStage } from './entities/deal.entity';
import { Reminder, ReminderReason } from './entities/reminder.entity';
import { ReminderService } from './reminder.service';

describe('FollowupService deal-stage lifecycle (SQLite)', () => {
  let ds: DataSource;
  let ruleRepo: Repository<FollowupRule>;
  let convoRepo: Repository<Conversation>;
  let dealRepo: Repository<Deal>;
  let reminderRepo: Repository<Reminder>;
  let sendTextMessage: jest.Mock;
  let service: FollowupService;
  const now = new Date('2026-10-19T10:00:00Z');
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const minutesAfter = (m: number) => new Date(now.getTime() + m * 60_000);

  // Business replied at -200 min, customer last wrote at -300 min: a "no reply" chat, idle well past any delay.
  const addChat = async (chatId: string) =>
    convoRepo.save(
      convoRepo.create({
        businessId: 'biz',
        sessionId: 'sess',
        chatId,
        chatName: 'Asha',
        status: ConversationStatus.OPEN,
        lastMessageAt: minutesAgo(200),
        lastInboundAt: minutesAgo(300),
      }),
    );
  const addDeal = (conversationId: string, stage: DealStage, stageChangedAt: Date | null, assignedTo = 'Riya') =>
    dealRepo.save(
      dealRepo.create({
        businessId: 'biz',
        title: `Deal ${stage}`,
        contactName: 'Asha',
        contactPhone: '911',
        stage,
        conversationId,
        assignedTo,
        stageChangedAt,
      }),
    );
  const addRule = (conditions: Record<string, unknown>, overrides: Partial<FollowupRule> = {}) =>
    ruleRepo.save(
      ruleRepo.create({
        businessId: 'biz',
        name: 'stage rule',
        trigger: FollowupTrigger.NO_REPLY,
        delayMinutes: 60,
        message: 'Default nudge',
        maxAttempts: 1,
        cooldownMinutes: 60,
        conditions,
        ...overrides,
      }),
    );
  const sentTexts = () => (sendTextMessage.mock.calls as unknown[][]).map(c => c[1]);
  const sentTo = () => (sendTextMessage.mock.calls as unknown[][]).map(c => c[0]);
  const reminders = (reason: ReminderReason) => reminderRepo.find({ where: { reason } });

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [FollowupRule, FollowupAttempt, Conversation, Deal, Reminder],
      synchronize: true,
    });
    await ds.initialize();
    ruleRepo = ds.getRepository(FollowupRule);
    convoRepo = ds.getRepository(Conversation);
    dealRepo = ds.getRepository(Deal);
    reminderRepo = ds.getRepository(Reminder);
    sendTextMessage = jest.fn().mockResolvedValue({ id: 'm' });
    const reminderService = new ReminderService(reminderRepo, dealRepo, { notify: jest.fn() } as never);
    service = new FollowupService(
      ruleRepo,
      ds.getRepository(FollowupAttempt),
      convoRepo,
      { get: () => ({ sendTextMessage }) } as never,
      reminderService,
    );
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('nudges only chats whose deal is in the rule stage', async () => {
    await addRule({ dealStage: DealStage.PROPOSAL });
    const inProposal = await addChat('911111111111@c.us');
    const inContacted = await addChat('912222222222@c.us');
    await addDeal(inProposal.id, DealStage.PROPOSAL, minutesAgo(180));
    await addDeal(inContacted.id, DealStage.CONTACTED, minutesAgo(180));

    await expect(service.runScheduler(now)).resolves.toBe(1);
    expect(sentTo()).toEqual(['911111111111@c.us']);
  });

  it('stops nudging once the deal is won or lost, because it is no longer in the rule stage', async () => {
    await addRule({ dealStage: DealStage.PROPOSAL });
    const convo = await addChat('913333333333@c.us');
    const deal = await addDeal(convo.id, DealStage.PROPOSAL, minutesAgo(180));
    await dealRepo.update(deal.id, { stage: DealStage.WON });

    await expect(service.runScheduler(now)).resolves.toBe(0);
  });

  it('waits the idle delay after a stage change, counting from the change, not the last message', async () => {
    await addRule({ dealStage: DealStage.PROPOSAL });
    const convo = await addChat('914444444444@c.us');
    // Chat idle for 200 min, but the deal only just moved to proposal: no nudge yet.
    await addDeal(convo.id, DealStage.PROPOSAL, minutesAgo(10));

    await expect(service.runScheduler(now)).resolves.toBe(0);
    await expect(service.runScheduler(minutesAfter(60))).resolves.toBe(1);
  });

  it('treats a legacy deal without stageChangedAt as having been in the stage since before', async () => {
    await addRule({ dealStage: DealStage.PROPOSAL });
    const convo = await addChat('915555555555@c.us');
    await addDeal(convo.id, DealStage.PROPOSAL, null);

    await expect(service.runScheduler(now)).resolves.toBe(1);
  });

  it('sends the messages in order and repeats the last one when the sequence is longer', async () => {
    await addRule(
      { dealStage: DealStage.PROPOSAL, messages: ['First {{name}}', 'Second', 'Third'] },
      { maxAttempts: 4, cooldownMinutes: 1 },
    );
    const convo = await addChat('916666666666@c.us');
    await addDeal(convo.id, DealStage.PROPOSAL, minutesAgo(180));

    await service.runScheduler(now);
    await service.runScheduler(minutesAfter(5));
    await service.runScheduler(minutesAfter(10));
    await service.runScheduler(minutesAfter(15));

    expect(sentTexts()).toEqual(['First Asha', 'Second', 'Third', 'Third']);
  });

  it('raises one reminder for the deal owner when the sequence runs out with no reply', async () => {
    await addRule({ dealStage: DealStage.PROPOSAL });
    const convo = await addChat('917777777777@c.us');
    const deal = await addDeal(convo.id, DealStage.PROPOSAL, minutesAgo(180), 'Riya');

    await service.runScheduler(now); // first nudge
    await service.runScheduler(minutesAfter(30)); // still inside the cooldown: no reminder yet
    expect(await reminders(ReminderReason.SEQUENCE_EXHAUSTED)).toHaveLength(0);

    await service.runScheduler(minutesAfter(61)); // cooldown over, sequence used up
    await service.runScheduler(minutesAfter(120)); // next tick must not duplicate it

    const raised = await reminders(ReminderReason.SEQUENCE_EXHAUSTED);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ dealId: deal.id, assignedTo: 'Riya', status: 'open' });
    expect(sentTo()).toHaveLength(1);
  });

  it('raises a reminder when the customer replies to a stage nudge, once', async () => {
    await addRule({ dealStage: DealStage.PROPOSAL }, { maxAttempts: 3 });
    const convo = await addChat('918888888888@c.us');
    await addDeal(convo.id, DealStage.PROPOSAL, minutesAgo(180));

    await service.runScheduler(now);
    await convoRepo.update(convo.id, { lastInboundAt: minutesAfter(5) });
    await service.runScheduler(minutesAfter(10));
    await service.runScheduler(minutesAfter(20));

    expect(await reminders(ReminderReason.CUSTOMER_REPLIED)).toHaveLength(1);
    // After the reply the chat is no longer "no reply", so no further nudges go out.
    expect(sentTo()).toHaveLength(1);
  });

  it('does not touch conversation-only rules that have no deal stage', async () => {
    await addRule({}, { trigger: FollowupTrigger.CONVERSATION_IDLE, maxAttempts: 1 });
    const convo = await addChat('919999999999@c.us');
    await addDeal(convo.id, DealStage.PROPOSAL, minutesAgo(180));

    await service.runScheduler(now);
    await service.runScheduler(minutesAfter(120));

    expect(await reminders(ReminderReason.SEQUENCE_EXHAUSTED)).toHaveLength(0);
    expect(sentTo()).toHaveLength(1);
  });
});

describe('assertLifecycleConditions', () => {
  it('accepts a valid stage rule and a plain rule', () => {
    expect(() => assertLifecycleConditions('no_reply', { dealStage: 'proposal', messages: ['a'] })).not.toThrow();
    expect(() => assertLifecycleConditions('conversation_idle', undefined)).not.toThrow();
  });

  it('rejects an unknown deal stage', () => {
    expect(() => assertLifecycleConditions('no_reply', { dealStage: 'propsal' })).toThrow(BadRequestException);
  });

  it('rejects a deal stage on a trigger that cannot honour it', () => {
    expect(() => assertLifecycleConditions('cart_abandoned', { dealStage: 'proposal' })).toThrow(BadRequestException);
  });

  it('rejects an empty or blank message list', () => {
    expect(() => assertLifecycleConditions('no_reply', { messages: [] })).toThrow(BadRequestException);
    expect(() => assertLifecycleConditions('no_reply', { messages: ['  '] })).toThrow(BadRequestException);
  });
});

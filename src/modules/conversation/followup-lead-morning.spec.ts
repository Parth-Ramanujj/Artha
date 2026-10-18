import { DataSource, Repository } from 'typeorm';
import { FollowupService } from './followup.service';
import { FollowupRule, FollowupTrigger } from './entities/followup-rule.entity';
import { FollowupAttempt } from './entities/followup-attempt.entity';
import { Conversation, ConversationStatus } from './entities/conversation.entity';

// IST is UTC+05:30, so 10:00 IST on 2026-10-18 is 04:30Z and the IST day starts at 2026-10-17T18:30Z.
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

describe('FollowupService lead_morning trigger', () => {
  let ds: DataSource;
  let ruleRepo: Repository<FollowupRule>;
  let attemptRepo: Repository<FollowupAttempt>;
  let convoRepo: Repository<Conversation>;
  let sendTextMessage: jest.Mock;
  let service: FollowupService;
  let rule: FollowupRule;

  const addConversation = (chatId: string, lastInboundAt: Date, status = ConversationStatus.OPEN) =>
    convoRepo.save(
      convoRepo.create({ businessId: 'biz', sessionId: 'sess', chatId, chatName: 'Priya', status, lastInboundAt }),
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [FollowupRule, FollowupAttempt, Conversation],
      synchronize: true,
    });
    await ds.initialize();
    ruleRepo = ds.getRepository(FollowupRule);
    attemptRepo = ds.getRepository(FollowupAttempt);
    convoRepo = ds.getRepository(Conversation);

    sendTextMessage = jest.fn().mockResolvedValue({ id: 'm1' });
    const engineRegistry = { get: () => ({ sendTextMessage }) };
    service = new FollowupService(ruleRepo, attemptRepo, convoRepo, engineRegistry as never);

    rule = await ruleRepo.save(
      ruleRepo.create({
        businessId: 'biz',
        name: 'Morning',
        trigger: FollowupTrigger.LEAD_MORNING,
        message: 'Good morning {{name}}',
        maxAttempts: 1,
        conditions: { sendAt: '10:00', timezone: 'Asia/Kolkata' },
      }),
    );
    await ruleRepo.update(rule.id, { createdAt: ist('2026-10-16', '09:00') });
    rule = await ruleRepo.findOneByOrFail({ id: rule.id });
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('messages a lead from yesterday once, and skips chats that do not qualify', async () => {
    await addConversation('911111111111@c.us', ist('2026-10-17', '17:30'));
    await addConversation('912222222222@c.us', ist('2026-10-18', '01:30'));
    await addConversation('913333333333@c.us', ist('2026-10-15', '12:00'));
    await addConversation('120363000000@g.us', ist('2026-10-17', '17:30'));
    await addConversation('914444444444@c.us', ist('2026-10-17', '17:30'), ConversationStatus.CLOSED);

    await expect(service.runScheduler(ist('2026-10-18', '10:05'))).resolves.toBe(1);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(sendTextMessage).toHaveBeenCalledWith('911111111111@c.us', 'Good morning Priya');

    await expect(service.runScheduler(ist('2026-10-18', '10:10'))).resolves.toBe(0);

    // Next morning: only the lead who first wrote at 01:30 on the 18th is due; the first lead is never messaged again.
    await expect(service.runScheduler(ist('2026-10-19', '10:05'))).resolves.toBe(1);
    expect(sendTextMessage).toHaveBeenLastCalledWith('912222222222@c.us', 'Good morning Priya');
    await expect(service.runScheduler(ist('2026-10-20', '10:05'))).resolves.toBe(0);
    expect(sendTextMessage).toHaveBeenCalledTimes(2);
  });

  it('only sends inside the window after the configured time', async () => {
    await addConversation('911111111111@c.us', ist('2026-10-17', '17:30'));

    await expect(service.runScheduler(ist('2026-10-18', '09:55'))).resolves.toBe(0);
    await expect(service.runScheduler(ist('2026-10-18', '13:05'))).resolves.toBe(0);
    await expect(service.runScheduler(ist('2026-10-18', '12:55'))).resolves.toBe(1);
  });

  it('does not count a failed send, so the lead is retried on the next tick', async () => {
    await addConversation('911111111111@c.us', ist('2026-10-17', '17:30'));
    sendTextMessage.mockRejectedValueOnce(new Error('offline'));

    await expect(service.runScheduler(ist('2026-10-18', '10:05'))).resolves.toBe(0);
    await expect(service.runScheduler(ist('2026-10-18', '10:10'))).resolves.toBe(1);
  });
});

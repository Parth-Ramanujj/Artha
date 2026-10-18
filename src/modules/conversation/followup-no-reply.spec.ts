import { DataSource, Repository } from 'typeorm';
import { FollowupService } from './followup.service';
import { FollowupRule, FollowupTrigger } from './entities/followup-rule.entity';
import { FollowupAttempt } from './entities/followup-attempt.entity';
import { Conversation, ConversationStatus } from './entities/conversation.entity';

describe('FollowupService no_reply / conversation_idle rules (SQLite)', () => {
  let ds: DataSource;
  let ruleRepo: Repository<FollowupRule>;
  let convoRepo: Repository<Conversation>;
  let sendTextMessage: jest.Mock;
  let service: FollowupService;
  const now = new Date('2026-10-19T10:00:00Z');
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  const addRule = (trigger: FollowupTrigger) =>
    ruleRepo.save(
      ruleRepo.create({
        businessId: 'biz',
        name: trigger,
        trigger,
        message: 'Still there?',
        delayMinutes: 60,
        maxAttempts: 1,
        cooldownMinutes: 1440,
      }),
    );
  const addConversation = (chatId: string, lastMessageAt: Date, lastInboundAt: Date | null) =>
    convoRepo.save(
      convoRepo.create({
        businessId: 'biz',
        sessionId: 'sess',
        chatId,
        status: ConversationStatus.OPEN,
        lastMessageAt,
        lastInboundAt,
      }),
    );
  const sentTo = () => (sendTextMessage.mock.calls as unknown[][]).map(c => c[0]);

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [FollowupRule, FollowupAttempt, Conversation],
      synchronize: true,
    });
    await ds.initialize();
    ruleRepo = ds.getRepository(FollowupRule);
    convoRepo = ds.getRepository(Conversation);
    sendTextMessage = jest.fn().mockResolvedValue({ id: 'm' });
    service = new FollowupService(ruleRepo, ds.getRepository(FollowupAttempt), convoRepo, {
      get: () => ({ sendTextMessage }),
    } as never);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('nudges a customer who went quiet after the business replied earlier the same day', async () => {
    await addRule(FollowupTrigger.NO_REPLY);
    // Same UTC day as `now`: the old string comparison against a "YYYY-MM-DD HH:MM" parameter missed these.
    await addConversation('911111111111@c.us', minutesAgo(90), minutesAgo(120));

    await expect(service.runScheduler(now)).resolves.toBe(1);
    expect(sentTo()).toEqual(['911111111111@c.us']);
  });

  it('leaves alone a customer still waiting for the business, one who never wrote, and groups', async () => {
    await addRule(FollowupTrigger.NO_REPLY);
    await addConversation('912222222222@c.us', minutesAgo(90), minutesAgo(90));
    await addConversation('913333333333@c.us', minutesAgo(90), null);
    await addConversation('120363000000@g.us', minutesAgo(90), minutesAgo(120));

    await expect(service.runScheduler(now)).resolves.toBe(0);
  });

  it('conversation_idle nudges either way, but never a group or a recent chat', async () => {
    await addRule(FollowupTrigger.CONVERSATION_IDLE);
    await addConversation('912222222222@c.us', minutesAgo(90), minutesAgo(90));
    await addConversation('914444444444@c.us', minutesAgo(10), minutesAgo(10));
    await addConversation('120363000000@g.us', minutesAgo(90), minutesAgo(90));

    await expect(service.runScheduler(now)).resolves.toBe(1);
    expect(sentTo()).toEqual(['912222222222@c.us']);
  });
});

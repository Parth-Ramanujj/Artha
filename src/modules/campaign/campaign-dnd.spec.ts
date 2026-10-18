import { DataSource } from 'typeorm';
import { CampaignService } from './campaign.service';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { CampaignRecipient, RecipientStatus } from './entities/campaign-recipient.entity';
import { ScheduledMessage, ScheduledMessageStatus } from './entities/scheduled-message.entity';
import { ContactConsent, ConsentStatus } from './entities/contact-consent.entity';
import { Conversation, ConversationStatus } from '../conversation/entities/conversation.entity';
import { hasDndTag, isOptInMessage, notDndSql } from '../conversation/dnd';

type Internals = { processCampaignDelivery(id: string): Promise<void>; checkScheduledJobs(): Promise<void> };

describe('opted-out contacts are not messaged by campaigns or scheduled messages (SQLite)', () => {
  let ds: DataSource;
  let service: CampaignService;
  let sendTextMessage: jest.Mock;
  const OPTED_OUT_BY_WORKFLOW = '911111111111@c.us';
  const OPTED_OUT_BY_CONSENT = '912222222222@c.us';
  const SUBSCRIBED = '913333333333@c.us';

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Campaign, CampaignRecipient, ScheduledMessage, ContactConsent, Conversation],
      synchronize: true,
    });
    await ds.initialize();
    sendTextMessage = jest.fn().mockResolvedValue({ id: 'm' });
    service = new CampaignService(
      ds.getRepository(ScheduledMessage),
      ds.getRepository(Campaign),
      ds.getRepository(CampaignRecipient),
      ds.getRepository(ContactConsent),
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      { get: () => ({ sendTextMessage }) } as never,
      ds.getRepository(Conversation),
    );

    const conversations = ds.getRepository(Conversation);
    await conversations.save([
      conversations.create({
        businessId: 'biz',
        sessionId: 'sess',
        chatId: OPTED_OUT_BY_WORKFLOW,
        status: ConversationStatus.OPEN,
        tags: ['vip', 'dnd'],
      }),
      conversations.create({
        businessId: 'biz',
        sessionId: 'sess',
        chatId: SUBSCRIBED,
        status: ConversationStatus.OPEN,
        tags: ['vip'],
      }),
    ]);
    // Operators often record consent by plain number rather than the WhatsApp chat id.
    await ds.getRepository(ContactConsent).save({
      businessId: 'biz',
      waContactId: '912222222222',
      channel: 'whatsapp',
      status: ConsentStatus.OPTED_OUT,
    });
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('skips opted-out recipients and still sends to the rest', async () => {
    const campaign = await ds.getRepository(Campaign).save({
      businessId: 'biz',
      name: 'Diwali offer',
      sessionId: 'sess',
      messageContent: 'Offer!',
      status: CampaignStatus.RUNNING,
      ratePerMinute: 600,
    });
    await ds
      .getRepository(CampaignRecipient)
      .save(
        [OPTED_OUT_BY_WORKFLOW, OPTED_OUT_BY_CONSENT, SUBSCRIBED].map(chatId => ({ campaignId: campaign.id, chatId })),
      );

    await (service as unknown as Internals).processCampaignDelivery(campaign.id);

    expect((sendTextMessage.mock.calls as unknown[][]).map(c => c[0])).toEqual([SUBSCRIBED]);
    const recipients = await ds.getRepository(CampaignRecipient).find();
    const byChat = Object.fromEntries(recipients.map(r => [r.chatId, r]));
    expect(byChat[OPTED_OUT_BY_WORKFLOW]).toMatchObject({ status: RecipientStatus.SKIPPED });
    expect(byChat[OPTED_OUT_BY_CONSENT]).toMatchObject({ status: RecipientStatus.SKIPPED });
    expect(byChat[SUBSCRIBED]).toMatchObject({ status: RecipientStatus.SENT });
    expect(await ds.getRepository(Campaign).findOneByOrFail({ id: campaign.id })).toMatchObject({
      status: CampaignStatus.COMPLETED,
      sentCount: 1,
      failedCount: 0,
    });
  });

  it('cancels a scheduled message to an opted-out contact', async () => {
    const scheduled = ds.getRepository(ScheduledMessage);
    await scheduled.save(
      [OPTED_OUT_BY_WORKFLOW, SUBSCRIBED].map(chatId => ({
        businessId: 'biz',
        sessionId: 'sess',
        chatId,
        content: 'Reminder',
        scheduledAt: new Date('2020-01-01T00:00:00Z'),
      })),
    );

    await (service as unknown as Internals).checkScheduledJobs();

    expect((sendTextMessage.mock.calls as unknown[][]).map(c => c[0])).toEqual([SUBSCRIBED]);
    const byChat = Object.fromEntries((await scheduled.find()).map(m => [m.chatId, m]));
    expect(byChat[OPTED_OUT_BY_WORKFLOW]).toMatchObject({
      status: ScheduledMessageStatus.CANCELLED,
      errorMessage: 'Contact opted out (DND)',
    });
    expect(byChat[SUBSCRIBED]).toMatchObject({ status: ScheduledMessageStatus.SENT });
  });

  it('the SQL filter matches the stored tags', async () => {
    const rows = await ds.getRepository(Conversation).createQueryBuilder('c').where(notDndSql('c')).getMany();
    expect(rows.map(r => r.chatId)).toEqual([SUBSCRIBED]);
  });
});

describe('DND helpers', () => {
  it.each([
    ['START', true],
    [' start! ', true],
    ['શરૂ', true],
    ['start the plan', false],
    ['restart', false],
  ])('%j is an opt-in → %s', (body, expected) => {
    expect(isOptInMessage(body)).toBe(expected);
  });

  it('reads the tag list', () => {
    expect(hasDndTag(['dnd'])).toBe(true);
    expect(hasDndTag(['dnd-team'])).toBe(false);
    expect(hasDndTag(null)).toBe(false);
  });
});

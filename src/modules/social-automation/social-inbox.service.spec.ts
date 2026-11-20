import { DataSource } from 'typeorm';
import { AddSocialAutomation1788600000000 } from '../../database/migrations/1788600000000-AddSocialAutomation';
import { AddSocialMessages1789400000000 } from '../../database/migrations/1789400000000-AddSocialMessages';
import { extractMessages } from './controllers/social-webhook.controller';
import {
  SocialAccount,
  SocialCommentLog,
  SocialCommentRule,
  SocialMessage,
  SocialPost,
} from './entities/social-automation.entity';
import { MetaGraphService } from './services/meta-graph.service';
import { SocialInboxService } from './social-inbox.service';

describe('extractMessages', () => {
  it('reads Instagram DMs and echoes, skipping reads and reactions', () => {
    const msgs = extractMessages({
      object: 'instagram',
      entry: [
        {
          id: '1784',
          messaging: [
            { sender: { id: 'cust' }, recipient: { id: '1784' }, message: { mid: 'm1', text: 'price?' } },
            {
              sender: { id: '1784' },
              recipient: { id: 'cust' },
              message: { mid: 'm2', text: 'Rs 499', is_echo: true },
            },
            { sender: { id: 'cust' }, recipient: { id: '1784' }, read: { mid: 'm2' } },
          ],
        },
      ],
    });
    expect(msgs).toEqual([
      expect.objectContaining({
        platform: 'instagram',
        targetAccountId: '1784',
        senderId: 'cust',
        mid: 'm1',
        isEcho: false,
      }),
      expect.objectContaining({ recipientId: 'cust', mid: 'm2', isEcho: true }),
    ]);
  });
});

describe('SocialInboxService', () => {
  let ds: DataSource;
  let inbox: SocialInboxService;
  let account: SocialAccount;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SocialAccount, SocialPost, SocialCommentRule, SocialCommentLog, SocialMessage],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddSocialAutomation1788600000000().up(qr);
    await new AddSocialMessages1789400000000().up(qr);
    await new AddSocialMessages1789400000000().up(qr); // idempotent
    account = await ds.getRepository(SocialAccount).save({
      businessId: 'b',
      platform: 'instagram',
      accountName: 'Shop',
      accountId: '1784',
      accessToken: 'mock_token',
      pageId: '99',
      metadata: '{}',
    });
    inbox = new SocialInboxService(
      ds.getRepository(SocialAccount),
      ds.getRepository(SocialMessage),
      new MetaGraphService(),
    );
  });

  afterEach(() => ds.destroy());

  const incoming = (mid: string, text: string, isEcho = false) => ({
    platform: 'instagram' as const,
    targetAccountId: '1784',
    senderId: isEcho ? '1784' : 'cust',
    recipientId: isEcho ? 'cust' : '1784',
    mid,
    text,
    isEcho,
  });

  it('stores each message once and groups it into one thread', async () => {
    await inbox.handleIncomingMessage(incoming('m1', 'price?'));
    await inbox.handleIncomingMessage(incoming('m1', 'price?')); // Meta retry
    await inbox.handleIncomingMessage(incoming('m2', 'Rs 499', true));

    const threads = await inbox.listThreads('b', 'instagram');
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      threadId: 'cust',
      lastText: 'Rs 499',
      lastDirection: 'out',
      accountName: 'Shop',
    });
    const msgs = await inbox.listMessages('b', account.id, 'cust');
    expect(msgs.map(m => [m.direction, m.text])).toEqual([
      ['in', 'price?'],
      ['out', 'Rs 499'],
    ]);
  });

  it('ignores messages for accounts that are not connected', async () => {
    expect(await inbox.handleIncomingMessage({ ...incoming('m9', 'hi'), targetAccountId: 'other' })).toBeNull();
  });

  it('sends a reply and keeps it in the thread', async () => {
    await inbox.handleIncomingMessage(incoming('m1', 'price?'));
    const sent = await inbox.sendMessage('b', account.id, 'cust', 'Rs 499');
    expect(sent).toMatchObject({ direction: 'out', text: 'Rs 499', threadId: 'cust' });
    expect(await inbox.listMessages('b', account.id, 'cust')).toHaveLength(2);
    await expect(inbox.sendMessage('other-business', account.id, 'cust', 'x')).rejects.toThrow('Account not found');
  });
});

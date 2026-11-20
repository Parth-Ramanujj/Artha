import { DataSource } from 'typeorm';
import { AddSocialAutomation1788600000000 } from '../../database/migrations/1788600000000-AddSocialAutomation';
import { AddSocialMessages1789400000000 } from '../../database/migrations/1789400000000-AddSocialMessages';
import { AddSocialAccountAiAutoReply1789600000000 } from '../../database/migrations/1789600000000-AddSocialAccountAiAutoReply';
import { extractMessages } from './controllers/social-webhook.controller';
import {
  SocialAccount,
  SocialCommentLog,
  SocialCommentRule,
  SocialMessage,
  SocialPost,
} from './entities/social-automation.entity';
import { MetaGraphService } from './services/meta-graph.service';
import { SocialAutomationService } from './social-automation.service';
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
  let autoReply: { reply: string; delaySeconds: number } | null;
  let social: { noteUnmatchedAccount: jest.Mock; dmAutoReply: jest.Mock };

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
    await new AddSocialAccountAiAutoReply1789600000000().up(qr);
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
    autoReply = null;
    social = {
      noteUnmatchedAccount: jest.fn(),
      dmAutoReply: jest.fn(() => Promise.resolve(autoReply)),
    };
    inbox = new SocialInboxService(
      ds.getRepository(SocialAccount),
      ds.getRepository(SocialMessage),
      new MetaGraphService(),
      social as unknown as SocialAutomationService,
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

describe('SocialInboxService auto-reply', () => {
  it('answers a customer DM with the rule reply and gives the AI the chat so far', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SocialAccount, SocialPost, SocialCommentRule, SocialCommentLog, SocialMessage],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddSocialAutomation1788600000000().up(qr);
    await new AddSocialMessages1789400000000().up(qr);
    await new AddSocialAccountAiAutoReply1789600000000().up(qr);
    const account = await ds.getRepository(SocialAccount).save({
      businessId: 'b',
      platform: 'facebook',
      accountName: 'Page',
      accountId: '99',
      accessToken: 'mock_token',
      pageId: '99',
      metadata: '{}',
    });
    const dmAutoReply = jest.fn().mockResolvedValue({ reply: 'Rs 499 only!', delaySeconds: 0 });
    const inbox = new SocialInboxService(
      ds.getRepository(SocialAccount),
      ds.getRepository(SocialMessage),
      new MetaGraphService(),
      { noteUnmatchedAccount: jest.fn(), dmAutoReply } as unknown as SocialAutomationService,
    );
    const dm = {
      platform: 'facebook' as const,
      targetAccountId: '99',
      senderId: 'cust',
      recipientId: '99',
      isEcho: false,
    };

    await inbox.handleIncomingMessage({ ...dm, mid: 'm1', text: 'price?' });
    expect(dmAutoReply).toHaveBeenCalledWith('b', 'facebook', 'friend', [{ from: 'customer', text: 'price?' }]);
    const msgs = await inbox.listMessages('b', account.id, 'cust');
    expect(msgs.map(m => [m.direction, m.text])).toEqual([
      ['in', 'price?'],
      ['out', 'Rs 499 only!'],
    ]);

    // Our own echo is stored but never answered.
    dmAutoReply.mockClear();
    await inbox.handleIncomingMessage({
      ...dm,
      senderId: '99',
      recipientId: 'cust',
      isEcho: true,
      mid: 'm9',
      text: 'hi',
    });
    expect(dmAutoReply).not.toHaveBeenCalled();
    await ds.destroy();
  });
});

describe('SocialInboxService AI agent', () => {
  it('lets the AI chatbot answer when no rule does, only on accounts that switched it on', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SocialAccount, SocialPost, SocialCommentRule, SocialCommentLog, SocialMessage],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddSocialAutomation1788600000000().up(qr);
    await new AddSocialMessages1789400000000().up(qr);
    await new AddSocialAccountAiAutoReply1789600000000().up(qr);
    const repo = ds.getRepository(SocialAccount);
    const base = {
      businessId: 'b',
      platform: 'instagram' as const,
      accessToken: 'mock_token',
      pageId: '99',
      metadata: '{}',
    };
    const on = await repo.save({ ...base, accountName: 'On', accountId: 'ig-on', aiAutoReply: true });
    const off = await repo.save({ ...base, accountName: 'Off', accountId: 'ig-off' });
    const aiAgentReply = jest.fn().mockResolvedValue('Our shop opens at 10.');
    const inbox = new SocialInboxService(repo, ds.getRepository(SocialMessage), new MetaGraphService(), {
      noteUnmatchedAccount: jest.fn(),
      dmAutoReply: jest.fn().mockResolvedValue(null),
      aiAgentReply,
    } as unknown as SocialAutomationService);
    const dm = (accountId: string, mid: string) => ({
      platform: 'instagram' as const,
      targetAccountId: accountId,
      senderId: 'cust',
      recipientId: accountId,
      mid,
      text: 'timing?',
      isEcho: false,
    });

    await inbox.handleIncomingMessage(dm('ig-off', 'a1'));
    expect(aiAgentReply).not.toHaveBeenCalled();
    expect(await inbox.listMessages('b', off.id, 'cust')).toHaveLength(1);

    await inbox.handleIncomingMessage(dm('ig-on', 'a2'));
    expect(aiAgentReply).toHaveBeenCalledWith('b', on.id, [{ from: 'customer', text: 'timing?' }]);
    const msgs = await inbox.listMessages('b', on.id, 'cust');
    expect(msgs.map(m => m.text)).toEqual(['timing?', 'Our shop opens at 10.']);
    await ds.destroy();
  }, 10_000);
});

describe('SocialInboxService contacts and leads', () => {
  it('saves a new Instagram customer as a contact and a lead, once', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SocialAccount, SocialPost, SocialCommentRule, SocialCommentLog, SocialMessage],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddSocialAutomation1788600000000().up(qr);
    await new AddSocialMessages1789400000000().up(qr);
    await new AddSocialAccountAiAutoReply1789600000000().up(qr);
    const repo = ds.getRepository(SocialAccount);
    const account = await repo.save({
      businessId: 'b',
      platform: 'instagram',
      accountName: 'Shop',
      accountId: '1784',
      accessToken: 'mock_token',
      pageId: '99',
      metadata: '{}',
    });
    const conversations = { getOrCreateContact: jest.fn().mockResolvedValue({}) };
    const leads = {
      captureInboundLead: jest.fn().mockResolvedValue({ lead: { id: 'L1' }, created: true }),
      applyAutoClassification: jest.fn().mockResolvedValue(undefined),
    };
    const classifier = { classify: jest.fn().mockResolvedValue({ temperature: 'warm' }) };
    const inbox = new SocialInboxService(
      repo,
      ds.getRepository(SocialMessage),
      new MetaGraphService(),
      {
        noteUnmatchedAccount: jest.fn(),
        dmAutoReply: jest.fn().mockResolvedValue(null),
      } as unknown as SocialAutomationService,
      conversations as never,
      leads as never,
      classifier as never,
    );
    const dm = (mid: string, text: string) => ({
      platform: 'instagram' as const,
      targetAccountId: '1784',
      senderId: 'cust',
      recipientId: '1784',
      mid,
      text,
      isEcho: false,
    });

    await inbox.handleIncomingMessage(dm('c1', 'price?'));
    await inbox.handleIncomingMessage(dm('c2', 'hello?'));
    expect(conversations.getOrCreateContact).toHaveBeenCalledTimes(1);
    expect(conversations.getOrCreateContact).toHaveBeenCalledWith('b', 'ig:cust', undefined);
    expect(leads.captureInboundLead).toHaveBeenCalledTimes(1);
    expect(leads.captureInboundLead).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'b', sessionId: account.id, chatId: 'ig:cust', source: 'instagram' }),
    );
    expect(leads.applyAutoClassification).toHaveBeenCalledWith('L1', { temperature: 'warm' });
    await ds.destroy();
  });
});

describe('SocialInboxService media', () => {
  it('hosts the file, sends it, and refuses documents on Instagram', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SocialAccount, SocialPost, SocialCommentRule, SocialCommentLog, SocialMessage],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddSocialAutomation1788600000000().up(qr);
    await new AddSocialMessages1789400000000().up(qr);
    await new AddSocialAccountAiAutoReply1789600000000().up(qr);
    const account = await ds.getRepository(SocialAccount).save({
      businessId: 'b',
      platform: 'instagram',
      accountName: 'Shop',
      accountId: '1784',
      accessToken: 'mock_token',
      pageId: '99',
      metadata: '{}',
    });
    const graph = new MetaGraphService();
    const inbox = new SocialInboxService(ds.getRepository(SocialAccount), ds.getRepository(SocialMessage), graph, {
      noteUnmatchedAccount: jest.fn(),
    } as unknown as SocialAutomationService);
    const png = Buffer.from('fake-png').toString('base64');
    const prev = process.env.BASE_URL;

    process.env.BASE_URL = '';
    await expect(inbox.sendMedia('b', account.id, 'cust', { base64: png, mimetype: 'image/png' })).rejects.toThrow(
      'BASE_URL',
    );

    process.env.BASE_URL = 'https://shop.example';
    await expect(
      inbox.sendMedia('b', account.id, 'cust', { base64: png, mimetype: 'application/pdf', filename: 'a.pdf' }),
    ).rejects.toThrow('photos, videos and audio');
    const sent = await inbox.sendMedia('b', account.id, 'cust', {
      base64: png,
      mimetype: 'image/png',
      filename: 'p.png',
    });
    expect(sent).toMatchObject({ direction: 'out', text: '📎 p.png' });
    const id = /media\/([\w-]+)\.png$/.exec(sent.mediaUrl ?? '')?.[1] ?? '';
    expect(graph.getHostedMedia(id)?.mimetype).toBe('image/png');

    process.env.BASE_URL = prev;
    await ds.destroy();
  });
});

describe('SocialInboxService workflows', () => {
  it('lets a matching workflow take the DM so rules and AI stay quiet', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SocialAccount, SocialPost, SocialCommentRule, SocialCommentLog, SocialMessage],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddSocialAutomation1788600000000().up(qr);
    await new AddSocialMessages1789400000000().up(qr);
    await new AddSocialAccountAiAutoReply1789600000000().up(qr);
    const account = await ds.getRepository(SocialAccount).save({
      businessId: 'b',
      platform: 'facebook',
      accountName: 'Page',
      accountId: '99',
      accessToken: 'mock_token',
      pageId: '99',
      metadata: '{}',
      aiAutoReply: true,
    });
    const dmAutoReply = jest.fn().mockResolvedValue({ reply: 'rule', delaySeconds: 0 });
    const trigger = { handleSocialMessage: jest.fn().mockResolvedValue(true) };
    const executor = { registerChannelSender: jest.fn() };
    const inbox = new SocialInboxService(
      ds.getRepository(SocialAccount),
      ds.getRepository(SocialMessage),
      new MetaGraphService(),
      { noteUnmatchedAccount: jest.fn(), dmAutoReply, aiAgentReply: jest.fn() } as unknown as SocialAutomationService,
      undefined,
      undefined,
      undefined,
      executor as never,
      trigger as never,
    );
    inbox.onModuleInit();
    expect(executor.registerChannelSender).toHaveBeenCalledWith('ig:', expect.any(Function));
    expect(executor.registerChannelSender).toHaveBeenCalledWith('fb:', expect.any(Function));

    await inbox.handleIncomingMessage({
      platform: 'facebook',
      targetAccountId: '99',
      senderId: 'cust',
      recipientId: '99',
      mid: 'w1',
      text: 'menu',
      isEcho: false,
    });
    expect(trigger.handleSocialMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'b',
        accountId: account.id,
        chatId: 'fb:cust',
        text: 'menu',
        channel: 'facebook',
      }),
    );
    expect(dmAutoReply).not.toHaveBeenCalled();
    await ds.destroy();
  });
});

import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { extractComments } from './controllers/social-webhook.controller';
import {
  SocialAccount,
  SocialCommentLog,
  SocialMessage,
  SocialCommentRule,
  SocialPost,
} from './entities/social-automation.entity';
import { MetaGraphService } from './services/meta-graph.service';
import { findMatchingRule, SocialAutomationService } from './social-automation.service';

const rule = (over: Partial<SocialCommentRule> = {}): SocialCommentRule =>
  ({
    id: 'r1',
    businessId: 'biz-1',
    name: 'Price',
    platform: 'all',
    postId: null,
    matchType: 'contains',
    keywords: JSON.stringify(['price', 'cost']),
    replyTemplates: JSON.stringify(['Hi {username}, check your DM!']),
    autoLike: true,
    autoDm: false,
    autoDmTemplate: null,
    useAi: false,
    aiPrompt: null,
    delaySeconds: 0,
    enabled: true,
    triggerCount: 0,
    ...over,
  }) as SocialCommentRule;

describe('findMatchingRule', () => {
  it('matches contains / exact / regex / all, honouring platform and post filters', () => {
    expect(findMatchingRule([rule()], 'What is the PRICE?', 'instagram')?.id).toBe('r1');
    expect(findMatchingRule([rule({ matchType: 'exact' })], 'price please', 'instagram')).toBeNull();
    expect(findMatchingRule([rule({ matchType: 'exact' })], ' Price ', 'instagram')?.id).toBe('r1');
    expect(
      findMatchingRule([rule({ matchType: 'regex', keywords: '["^how much"]' })], 'How much?', 'facebook')?.id,
    ).toBe('r1');
    expect(findMatchingRule([rule({ matchType: 'regex', keywords: '["(bad"]' })], 'bad', 'facebook')).toBeNull();
    expect(findMatchingRule([rule({ matchType: 'all' })], 'anything', 'facebook')?.id).toBe('r1');
    expect(findMatchingRule([rule({ platform: 'facebook' })], 'price', 'instagram')).toBeNull();
    expect(findMatchingRule([rule({ postId: 'p1' })], 'price', 'instagram', 'p2')).toBeNull();
    expect(findMatchingRule([rule({ postId: 'p1' })], 'price', 'instagram', 'p1')?.id).toBe('r1');
    expect(findMatchingRule([rule({ enabled: false })], 'price', 'instagram')).toBeNull();
  });
});

describe('extractComments', () => {
  it('reads Instagram comments and Facebook feed comment adds only', () => {
    const ig = extractComments({
      object: 'instagram',
      entry: [
        {
          id: '178',
          changes: [
            {
              field: 'comments',
              value: { id: 'c1', text: 'price?', media: { id: 'm1' }, from: { id: 'u1', username: 'pooja' } },
            },
          ],
        },
      ],
    });
    expect(ig).toEqual([
      {
        platform: 'instagram',
        targetAccountId: '178',
        commentId: 'c1',
        commentText: 'price?',
        postId: 'm1',
        fromUserId: 'u1',
        fromUserName: 'pooja',
      },
    ]);

    const fb = extractComments({
      object: 'page',
      entry: [
        {
          id: '99',
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                verb: 'add',
                comment_id: 'c2',
                message: 'hi',
                post_id: 'p',
                from: { id: 'u2', name: 'Raj' },
              },
            },
            { field: 'feed', value: { item: 'comment', verb: 'edited', comment_id: 'c3', message: 'x' } },
            { field: 'feed', value: { item: 'reaction', verb: 'add' } },
          ],
        },
      ],
    });
    expect(fb.map(c => c.commentId)).toEqual(['c2']);
    expect(extractComments({ object: 'whatsapp_business_account', entry: [] })).toEqual([]);
  });
});

describe('SocialAutomationService', () => {
  let service: SocialAutomationService;
  let account: Partial<SocialAccount> | null;
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(() => Promise.resolve(account)),
  };
  const accountRepo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn((x: object) => ({ id: 'acc-1', ...x })),
    save: jest.fn((x: object) => Promise.resolve(x)),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const postRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    create: jest.fn((x: object) => ({ id: 'p1', ...x })),
    save: jest.fn((x: object) => Promise.resolve(x)),
  };
  const ruleRepo = { find: jest.fn(), increment: jest.fn() };
  const logRepo = {
    exists: jest.fn(),
    create: jest.fn((x: object) => ({ ...x })),
    save: jest.fn((x: object) => Promise.resolve(x)),
  };
  const meta = {
    verifyAccountToken: jest.fn(),
    connectAccount: jest.fn(),
    publishToInstagram: jest.fn(),
    publishToFacebook: jest.fn(),
    likeComment: jest.fn().mockResolvedValue({ success: true }),
    replyToComment: jest.fn().mockResolvedValue({ success: true, replyId: 'r' }),
    sendPrivateReply: jest.fn().mockResolvedValue({ success: true }),
  };

  const comment = {
    platform: 'instagram' as const,
    targetAccountId: '178',
    commentId: 'c1',
    commentText: 'price?',
    postId: 'm1',
    fromUserId: 'u1',
    fromUserName: 'pooja',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    account = {
      id: 'acc-1',
      businessId: 'biz-1',
      platform: 'instagram',
      accountId: '178',
      pageId: '99',
      accessToken: 'tok',
      status: 'connected',
      accountName: 'Shop',
    };
    logRepo.exists.mockResolvedValue(false);
    ruleRepo.find.mockResolvedValue([rule()]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        SocialAutomationService,
        { provide: getRepositoryToken(SocialAccount, 'data'), useValue: accountRepo },
        { provide: getRepositoryToken(SocialPost, 'data'), useValue: postRepo },
        { provide: getRepositoryToken(SocialCommentRule, 'data'), useValue: ruleRepo },
        { provide: getRepositoryToken(SocialCommentLog, 'data'), useValue: logRepo },
        { provide: getRepositoryToken(SocialMessage, 'data'), useValue: {} },
        { provide: MetaGraphService, useValue: meta },
      ],
    }).compile();
    service = moduleRef.get(SocialAutomationService);
  });

  it('replies to a matching comment with the business token, and skips the like on Instagram', async () => {
    const log = await service.handleIncomingComment(comment);
    expect(meta.replyToComment).toHaveBeenCalledWith('instagram', 'c1', 'Hi pooja, check your DM!', 'tok');
    expect(meta.likeComment).not.toHaveBeenCalled();
    expect(log).toMatchObject({ businessId: 'biz-1', replied: true, status: 'success' });
    expect(ruleRepo.increment).toHaveBeenCalledWith({ id: 'r1' }, 'triggerCount', 1);
  });

  it('ignores comments for unknown accounts, our own comments and repeat deliveries', async () => {
    account = null;
    expect(await service.handleIncomingComment(comment)).toBeNull();

    account = {
      id: 'acc-1',
      businessId: 'biz-1',
      platform: 'instagram',
      accountId: '178',
      pageId: '99',
      accessToken: 'tok',
      status: 'connected',
    };
    expect(await service.handleIncomingComment({ ...comment, fromUserId: '178' })).toBeNull();

    logRepo.exists.mockResolvedValue(true);
    expect(await service.handleIncomingComment(comment)).toBeNull();
    expect(meta.replyToComment).not.toHaveBeenCalled();
  });

  it('refuses to publish a post that is already being published', async () => {
    postRepo.findOne.mockResolvedValue({ id: 'p1', businessId: 'biz-1', status: 'publishing' });
    postRepo.update.mockResolvedValue({ affected: 0 });
    await expect(service.publishPostNow('biz-1', 'p1')).rejects.toBeInstanceOf(ConflictException);
    expect(meta.publishToInstagram).not.toHaveBeenCalled();
  });

  it('publishes a claimed post and records the remote id', async () => {
    postRepo.findOne.mockResolvedValue({
      id: 'p1',
      businessId: 'biz-1',
      platform: 'instagram',
      status: 'draft',
      caption: 'c',
      mediaUrl: 'https://x/y.jpg',
      mediaType: 'IMAGE',
      accountId: null,
    });
    postRepo.update.mockResolvedValue({ affected: 1 });
    meta.publishToInstagram.mockResolvedValue({
      success: true,
      remotePostId: 'ig1',
      permalink: 'https://instagram.com/p/ig1',
    });
    const post = await service.publishPostNow('biz-1', 'p1');
    expect(meta.publishToInstagram).toHaveBeenCalledWith('178', 'tok', 'https://x/y.jpg', 'c', 'IMAGE');
    expect(post).toMatchObject({ status: 'published', remotePostId: 'ig1', accountId: 'acc-1' });
  });

  it('rejects a second connection of the same Meta account', async () => {
    accountRepo.findOne.mockResolvedValue({ id: 'other' });
    await expect(
      service.createAccount('biz-2', { platform: 'instagram', accountId: '178', accessToken: 'x', pageId: '99' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

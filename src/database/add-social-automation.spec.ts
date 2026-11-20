import { DataSource, In } from 'typeorm';
import { AddSocialAutomation1788600000000 } from './migrations/1788600000000-AddSocialAutomation';
import { AddRuleAppliesTo1789500000000 } from './migrations/1789500000000-AddRuleAppliesTo';
import {
  SocialAccount,
  SocialCommentLog,
  SocialCommentRule,
  SocialPost,
} from '../modules/social-automation/entities/social-automation.entity';

describe('AddSocialAutomation migration', () => {
  it('creates tables the entities can read and write', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SocialAccount, SocialPost, SocialCommentRule, SocialCommentLog],
      migrations: [],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddSocialAutomation1788600000000().up(qr);
    await new AddSocialAutomation1788600000000().up(qr); // idempotent
    await new AddRuleAppliesTo1789500000000().up(qr);
    await new AddRuleAppliesTo1789500000000().up(qr); // idempotent

    const acc = await ds.getRepository(SocialAccount).save({
      businessId: 'b',
      platform: 'instagram',
      accountName: 'Shop',
      accountId: '178',
      accessToken: 'secret',
      pageId: '99',
      webhookVerifyToken: 'vt',
      metadata: '{}',
    });
    // The token is never selected by default, only on request.
    expect((await ds.getRepository(SocialAccount).findOneByOrFail({ id: acc.id })).accessToken).toBeUndefined();
    const withToken = await ds
      .getRepository(SocialAccount)
      .createQueryBuilder('a')
      .addSelect('a.accessToken')
      .where('a.id = :id', { id: acc.id })
      .getOneOrFail();
    expect(withToken.accessToken).toBe('secret');

    const post = await ds.getRepository(SocialPost).save({
      businessId: 'b',
      platform: 'instagram',
      caption: 'c',
      mediaUrl: 'https://x/y.jpg',
      status: 'scheduled',
      scheduledAt: new Date('2026-11-20T05:00:00Z'),
    });
    const claim = await ds
      .getRepository(SocialPost)
      .update({ id: post.id, status: In(['draft', 'scheduled']) }, { status: 'publishing' });
    expect(claim.affected).toBe(1);
    const back = await ds.getRepository(SocialPost).findOneByOrFail({ id: post.id });
    expect(back.status).toBe('publishing');
    expect(back.scheduledAt?.toISOString()).toBe('2026-11-20T05:00:00.000Z');

    await ds
      .getRepository(SocialCommentRule)
      .save({ businessId: 'b', name: 'r', keywords: '["price"]', replyTemplates: '[]' });
    const log = { businessId: 'b', platform: 'instagram' as const, postId: 'm', commentId: 'c1', commentText: 'hi' };
    await ds.getRepository(SocialCommentLog).save(log);
    await expect(ds.getRepository(SocialCommentLog).insert(log)).rejects.toThrow(/UNIQUE/);

    await new AddSocialAutomation1788600000000().down(qr);
    expect(await qr.hasTable('social_accounts')).toBe(false);
    await ds.destroy();
  });
});

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import {
  CreateCommentRuleDto,
  CreateSocialAccountDto,
  CreateSocialPostDto,
  SimulateCommentDto,
  UpdateCommentRuleDto,
  UpdateSocialAccountDto,
  UpdateSocialPostDto,
} from './dto/social-automation.dto';
import {
  SocialAccount,
  SocialCommentLog,
  SocialCommentRule,
  SocialPlatform,
  SocialPost,
} from './entities/social-automation.entity';
import { MetaGraphService } from './services/meta-graph.service';

const SCHEDULER_INTERVAL_MS = 30_000;
const DUE_BATCH = 10;
// A post left in 'publishing' this long (process crashed mid-publish) is failed so it never sticks.
const STUCK_PUBLISHING_MS = 15 * 60_000;
const MAX_REPLY_DELAY_S = 10;
const MAX_COMMENT_CHARS = 2200; // Instagram's own comment limit
const MAX_REGEX_CHARS = 200;
const DEFAULT_AI_PROMPT = 'You are a friendly brand social media assistant. Write a short, polite, engaging reply.';

export interface IncomingComment {
  platform: SocialPlatform;
  postId: string;
  commentId: string;
  commentText: string;
  fromUserId?: string;
  fromUserName?: string;
  /** Instagram account id or Facebook Page id the webhook entry belongs to. */
  targetAccountId: string;
}

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function parseList(json: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** What the dashboard shows about the last connection check (never the token). */
const connectionMetadata = (check: {
  valid: boolean;
  name?: string;
  error?: string;
  webhookError?: string;
  messagesError?: string;
}): string =>
  JSON.stringify(
    check.valid
      ? {
          verifiedName: check.name,
          webhooks: check.webhookError ? 'failed' : 'subscribed',
          webhookError: check.webhookError,
          messagesError: check.messagesError,
        }
      : { lastError: check.error },
  );

const SERVER_STARTED_AT = new Date().toISOString();

const fill = (template: string, username: string, comment: string): string =>
  template.replace(/\{username\}/gi, username).replace(/\{comment\}/gi, comment);

/** Rule matching, kept pure so it is unit-tested directly. The first enabled rule in order wins. */
export function findMatchingRule(
  rules: SocialCommentRule[],
  commentText: string,
  platform: SocialPlatform,
  postId?: string,
): SocialCommentRule | null {
  const text = commentText.toLowerCase().trim();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.platform !== 'all' && rule.platform !== platform) continue;
    if (rule.postId && rule.postId !== postId) continue;
    if (rule.matchType === 'all') return rule;

    const keywords = parseList(rule.keywords)
      .map(k => k.toLowerCase().trim())
      .filter(Boolean);
    const hit = keywords.some(k => {
      if (rule.matchType === 'contains') return text.includes(k);
      if (rule.matchType === 'exact') return text === k;
      if (rule.matchType === 'regex') {
        try {
          return k.length <= MAX_REGEX_CHARS && new RegExp(k, 'i').test(text);
        } catch {
          return false;
        }
      }
      return false;
    });
    if (hit) return rule;
  }
  return null;
}

@Injectable()
export class SocialAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocialAutomationService.name);
  private schedulerTimer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(
    @InjectRepository(SocialAccount, 'data')
    private readonly accountRepo: Repository<SocialAccount>,
    @InjectRepository(SocialPost, 'data')
    private readonly postRepo: Repository<SocialPost>,
    @InjectRepository(SocialCommentRule, 'data')
    private readonly ruleRepo: Repository<SocialCommentRule>,
    @InjectRepository(SocialCommentLog, 'data')
    private readonly logRepo: Repository<SocialCommentLog>,
    private readonly metaGraph: MetaGraphService,
    @Optional() private readonly aiService?: AiService,
  ) {}

  onModuleInit(): void {
    this.schedulerTimer = setInterval(() => void this.tick(), SCHEDULER_INTERVAL_MS);
    this.schedulerTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
  }

  // ── Accounts ──

  async listAccounts(businessId: string): Promise<SocialAccount[]> {
    return this.accountRepo.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  /** Loads an account including its access token (the column is select: false). */
  private withToken() {
    return this.accountRepo.createQueryBuilder('a').addSelect('a.accessToken');
  }

  private async getAccount(businessId: string, id: string, withToken = false): Promise<SocialAccount> {
    const account = withToken
      ? await this.withToken().where('a.id = :id AND a.businessId = :businessId', { id, businessId }).getOne()
      : await this.accountRepo.findOne({ where: { id, businessId } });
    if (!account) throw new NotFoundException('Social account not found');
    return account;
  }

  /** One Meta account can only be connected once, or webhook events could not be routed to a business. */
  private async assertAccountFree(platform: SocialPlatform, accountId: string, exceptId?: string): Promise<void> {
    const existing = await this.accountRepo.findOne({ where: { platform, accountId } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(`This ${platform} account is already connected`);
    }
  }

  async createAccount(businessId: string, dto: CreateSocialAccountDto): Promise<SocialAccount> {
    await this.assertAccountFree(dto.platform, dto.accountId);
    if (dto.platform === 'instagram' && !dto.pageId) {
      throw new BadRequestException('Instagram accounts need the linked Facebook Page ID');
    }
    const pageId = dto.platform === 'facebook' ? dto.accountId : dto.pageId || null;
    const check = await this.metaGraph.connectAccount(dto.platform, dto.accountId, dto.accessToken, pageId);
    const saved = await this.accountRepo.save(
      this.accountRepo.create({
        businessId,
        platform: dto.platform,
        accountName: dto.accountName?.trim() || check.name || `${dto.platform} account`,
        accountId: dto.accountId,
        // A User token for a Page is swapped for the Page token, which is what publishing needs.
        accessToken: check.pageAccessToken || dto.accessToken,
        pageId,
        webhookVerifyToken: dto.webhookVerifyToken?.trim() || randomBytes(18).toString('hex'),
        status: check.valid ? 'connected' : 'disconnected',
        metadata: connectionMetadata(check),
      }),
    );
    return this.getAccount(businessId, saved.id);
  }

  async updateAccount(businessId: string, id: string, dto: UpdateSocialAccountDto): Promise<SocialAccount> {
    const account = await this.getAccount(businessId, id, true);
    if (dto.platform !== undefined) account.platform = dto.platform;
    if (dto.accountId !== undefined) account.accountId = dto.accountId;
    if (dto.platform !== undefined || dto.accountId !== undefined) {
      await this.assertAccountFree(account.platform, account.accountId, account.id);
    }
    if (dto.accountName !== undefined) account.accountName = dto.accountName;
    if (dto.accessToken) account.accessToken = dto.accessToken;
    if (dto.pageId !== undefined) account.pageId = dto.pageId || null;
    if (account.platform === 'facebook') account.pageId = account.accountId;
    if (dto.webhookVerifyToken) account.webhookVerifyToken = dto.webhookVerifyToken.trim();
    if (account.platform === 'instagram' && !account.pageId) {
      throw new BadRequestException('Instagram accounts need the linked Facebook Page ID');
    }

    if (dto.status === 'disconnected') {
      account.status = 'disconnected';
    } else if (dto.accessToken || dto.accountId !== undefined || dto.platform !== undefined || dto.status) {
      const check = await this.metaGraph.connectAccount(
        account.platform,
        account.accountId,
        account.accessToken,
        account.pageId,
      );
      account.status = check.valid ? 'connected' : 'disconnected';
      account.metadata = connectionMetadata(check);
      if (check.pageAccessToken) account.accessToken = check.pageAccessToken;
      if (check.name && !account.accountName?.trim()) account.accountName = check.name;
    }
    await this.accountRepo.save(account);
    return this.getAccount(businessId, id);
  }

  async deleteAccount(businessId: string, id: string): Promise<void> {
    const res = await this.accountRepo.delete({ id, businessId });
    if (!res.affected) throw new NotFoundException('Social account not found');
  }

  async testAccountConnection(
    businessId: string,
    id: string,
  ): Promise<{ valid: boolean; name?: string; error?: string; webhookError?: string; messagesError?: string }> {
    const account = await this.getAccount(businessId, id, true);
    const check = await this.metaGraph.connectAccount(
      account.platform,
      account.accountId,
      account.accessToken,
      account.pageId,
    );
    await this.accountRepo.update(account.id, {
      status: check.valid ? 'connected' : 'disconnected',
      metadata: connectionMetadata(check),
      ...(check.pageAccessToken ? { accessToken: check.pageAccessToken } : {}),
    });
    return {
      valid: check.valid,
      name: check.name,
      error: check.error,
      webhookError: check.webhookError,
      messagesError: check.messagesError,
    };
  }

  /** Webhook verification: the token must be one a connected account was given. */
  async isKnownVerifyToken(token: string): Promise<boolean> {
    if (!token) return false;
    return (await this.accountRepo.count({ where: { webhookVerifyToken: token } })) > 0;
  }

  // ── Posts ──

  async listPosts(businessId: string): Promise<SocialPost[]> {
    return this.postRepo.find({ where: { businessId }, order: { createdAt: 'DESC' }, take: 500 });
  }

  private parseSchedule(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) throw new BadRequestException('Invalid scheduledAt date');
    return date;
  }

  async createPost(businessId: string, dto: CreateSocialPostDto, creator = 'user'): Promise<SocialPost> {
    if (dto.accountId) {
      const account = await this.getAccount(businessId, dto.accountId);
      if (account.platform !== dto.platform) {
        throw new BadRequestException(`That account is a ${account.platform} account, not ${dto.platform}`);
      }
    }
    const scheduledAt = dto.publishNow ? null : this.parseSchedule(dto.scheduledAt);
    const saved = await this.postRepo.save(
      this.postRepo.create({
        businessId,
        accountId: dto.accountId || null,
        platform: dto.platform,
        caption: dto.caption,
        mediaUrl: dto.mediaUrl,
        mediaType: dto.mediaType || 'IMAGE',
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduledAt,
        createdBy: creator,
      }),
    );
    return dto.publishNow ? this.publishPostNow(businessId, saved.id) : saved;
  }

  async updatePost(businessId: string, id: string, dto: UpdateSocialPostDto): Promise<SocialPost> {
    const post = await this.postRepo.findOne({ where: { id, businessId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status === 'published' || post.status === 'publishing') {
      throw new BadRequestException('A published post cannot be edited');
    }
    if (dto.caption !== undefined) post.caption = dto.caption;
    if (dto.mediaUrl !== undefined) post.mediaUrl = dto.mediaUrl;
    if (dto.mediaType !== undefined) post.mediaType = dto.mediaType;
    if (dto.scheduledAt !== undefined) post.scheduledAt = this.parseSchedule(dto.scheduledAt);
    if (dto.status !== undefined) post.status = dto.status;
    else if (dto.scheduledAt !== undefined) post.status = post.scheduledAt ? 'scheduled' : 'draft';
    if (post.status === 'scheduled' && !post.scheduledAt) {
      throw new BadRequestException('A scheduled post needs scheduledAt');
    }
    post.error = null;
    return this.postRepo.save(post);
  }

  async deletePost(businessId: string, id: string): Promise<void> {
    const res = await this.postRepo.delete({ id, businessId });
    if (!res.affected) throw new NotFoundException('Post not found');
  }

  async publishPostNow(businessId: string, id: string): Promise<SocialPost> {
    const post = await this.postRepo.findOne({ where: { id, businessId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status === 'published') throw new BadRequestException('This post is already published');
    // Atomic claim: the scheduler and a manual "publish now" can never both publish the same post.
    const claim = await this.postRepo.update(
      { id, businessId, status: In(['draft', 'scheduled', 'failed']) },
      { status: 'publishing', error: null },
    );
    if (!claim.affected) throw new ConflictException('This post is already being published');
    return this.publishClaimed(post);
  }

  private async publishClaimed(post: SocialPost): Promise<SocialPost> {
    const finish = async (patch: Partial<SocialPost>): Promise<SocialPost> => {
      await this.postRepo.update(post.id, patch);
      return { ...post, ...patch };
    };
    try {
      const qb = this.withToken().where('a.businessId = :businessId', { businessId: post.businessId });
      const account = post.accountId
        ? await qb.andWhere('a.id = :id', { id: post.accountId }).getOne()
        : await qb
            .andWhere('a.platform = :platform AND a.status = :status', { platform: post.platform, status: 'connected' })
            .orderBy('a.createdAt', 'ASC')
            .getOne();
      if (!account) return await finish({ status: 'failed', error: `No connected ${post.platform} account` });
      if (account.status !== 'connected') {
        return await finish({ status: 'failed', error: `${account.accountName} is disconnected; reconnect it first` });
      }

      const result =
        post.platform === 'instagram'
          ? await this.metaGraph.publishToInstagram(
              account.accountId,
              account.accessToken,
              post.mediaUrl,
              post.caption,
              post.mediaType,
            )
          : await this.metaGraph.publishToFacebook(
              account.accountId,
              account.accessToken,
              post.mediaUrl,
              post.caption,
              post.mediaType,
            );

      return result.success
        ? await finish({
            status: 'published',
            publishedAt: new Date(),
            remotePostId: result.remotePostId,
            permalink: result.permalink || null,
            accountId: account.id,
            error: null,
          })
        : await finish({ status: 'failed', error: (result.error || 'Publishing failed').slice(0, 2000) });
    } catch (err) {
      this.logger.error(`Publishing post ${post.id} failed: ${errMsg(err)}`);
      return finish({ status: 'failed', error: errMsg(err).slice(0, 2000) });
    }
  }

  /** Publishes due scheduled posts. Each post is claimed atomically before publishing. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.postRepo.update(
        { status: 'publishing', updatedAt: LessThanOrEqual(new Date(now.getTime() - STUCK_PUBLISHING_MS)) },
        { status: 'failed', error: 'Publishing was interrupted; check the account and publish again' },
      );
      const due = await this.postRepo.find({
        where: { status: 'scheduled', scheduledAt: LessThanOrEqual(now) },
        order: { scheduledAt: 'ASC' },
        take: DUE_BATCH,
      });
      for (const post of due) {
        const claim = await this.postRepo.update({ id: post.id, status: 'scheduled' }, { status: 'publishing' });
        if (claim.affected) await this.publishClaimed(post);
      }
    } catch (err) {
      this.logger.error(`Social post scheduler tick failed: ${errMsg(err)}`);
    } finally {
      this.ticking = false;
    }
  }

  // ── Comment rules ──

  async listRules(businessId: string): Promise<SocialCommentRule[]> {
    return this.ruleRepo.find({ where: { businessId }, order: { createdAt: 'ASC' } });
  }

  private assertRuleUsable(
    rule: Pick<
      SocialCommentRule,
      'matchType' | 'keywords' | 'replyTemplates' | 'useAi' | 'autoLike' | 'autoDm' | 'autoDmTemplate'
    >,
  ): void {
    const keywords = parseList(rule.keywords);
    if (rule.matchType !== 'all' && !keywords.some(k => k.trim())) {
      throw new BadRequestException('Add at least one keyword, or match all comments');
    }
    if (rule.matchType === 'regex') {
      for (const k of keywords) {
        if (k.length > MAX_REGEX_CHARS)
          throw new BadRequestException(`Regex is longer than ${MAX_REGEX_CHARS} characters`);
        try {
          new RegExp(k, 'i');
        } catch {
          throw new BadRequestException(`Invalid regex: ${k}`);
        }
      }
    }
    if (rule.autoDm && !rule.autoDmTemplate?.trim()) {
      throw new BadRequestException('Write the DM text, or turn off auto DM');
    }
    if (!rule.useAi && !rule.autoLike && !rule.autoDm && !parseList(rule.replyTemplates).some(t => t.trim())) {
      throw new BadRequestException('The rule does nothing: add a reply, AI reply, like or DM');
    }
  }

  async createRule(businessId: string, dto: CreateCommentRuleDto): Promise<SocialCommentRule> {
    const rule = this.ruleRepo.create({
      businessId,
      name: dto.name,
      platform: dto.platform || 'all',
      postId: dto.postId || null,
      matchType: dto.matchType || 'contains',
      keywords: JSON.stringify(dto.keywords || []),
      replyTemplates: JSON.stringify(dto.replyTemplates || []),
      autoLike: dto.autoLike ?? false,
      autoDm: dto.autoDm ?? false,
      autoDmTemplate: dto.autoDmTemplate || null,
      useAi: dto.useAi ?? false,
      aiPrompt: dto.aiPrompt || null,
      delaySeconds: dto.delaySeconds ?? 3,
      enabled: dto.enabled ?? true,
    });
    this.assertRuleUsable(rule);
    return this.ruleRepo.save(rule);
  }

  async updateRule(businessId: string, id: string, dto: UpdateCommentRuleDto): Promise<SocialCommentRule> {
    const rule = await this.ruleRepo.findOne({ where: { id, businessId } });
    if (!rule) throw new NotFoundException('Comment rule not found');
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.platform !== undefined) rule.platform = dto.platform;
    if (dto.postId !== undefined) rule.postId = dto.postId || null;
    if (dto.matchType !== undefined) rule.matchType = dto.matchType;
    if (dto.keywords !== undefined) rule.keywords = JSON.stringify(dto.keywords);
    if (dto.replyTemplates !== undefined) rule.replyTemplates = JSON.stringify(dto.replyTemplates);
    if (dto.autoLike !== undefined) rule.autoLike = dto.autoLike;
    if (dto.autoDm !== undefined) rule.autoDm = dto.autoDm;
    if (dto.autoDmTemplate !== undefined) rule.autoDmTemplate = dto.autoDmTemplate || null;
    if (dto.useAi !== undefined) rule.useAi = dto.useAi;
    if (dto.aiPrompt !== undefined) rule.aiPrompt = dto.aiPrompt || null;
    if (dto.delaySeconds !== undefined) rule.delaySeconds = dto.delaySeconds;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    this.assertRuleUsable(rule);
    return this.ruleRepo.save(rule);
  }

  async deleteRule(businessId: string, id: string): Promise<void> {
    const res = await this.ruleRepo.delete({ id, businessId });
    if (!res.affected) throw new NotFoundException('Comment rule not found');
  }

  async toggleRule(businessId: string, id: string, enabled: boolean): Promise<SocialCommentRule> {
    const rule = await this.ruleRepo.findOne({ where: { id, businessId } });
    if (!rule) throw new NotFoundException('Comment rule not found');
    rule.enabled = enabled;
    return this.ruleRepo.save(rule);
  }

  // ── Incoming comments (webhook) ──

  private async aiReply(rule: SocialCommentRule, username: string, comment: string): Promise<string> {
    if (!rule.useAi || !this.aiService) return '';
    try {
      const completion = await this.aiService.complete(
        [
          { role: 'system', content: rule.aiPrompt || DEFAULT_AI_PROMPT },
          {
            role: 'user',
            content: `Instagram/Facebook user "${username}" commented: """${comment}"""\nWrite one short, friendly reply (max 2 sentences). Reply with the text only.`,
          },
        ],
        { maxTokens: 120 },
      );
      return (completion.content || '').trim().slice(0, 1000);
    } catch (err) {
      this.logger.warn(`AI comment reply failed, using templates: ${errMsg(err)}`);
      return '';
    }
  }

  /**
   * Handles one comment from the Meta webhook. Routed only to the business that connected the account;
   * the account's own comments (including our replies) and repeated deliveries are ignored.
   */
  async handleIncomingComment(event: IncomingComment): Promise<SocialCommentLog | null> {
    const account = await this.withToken()
      .where('a.accountId = :accountId AND a.platform = :platform', {
        accountId: event.targetAccountId,
        platform: event.platform,
      })
      .getOne();
    if (!account) this.noteUnmatchedAccount(event.platform, event.targetAccountId);
    if (!account || account.status !== 'connected') return null;
    if (event.fromUserId && (event.fromUserId === account.accountId || event.fromUserId === account.pageId))
      return null;

    const businessId = account.businessId;
    if (await this.logRepo.exists({ where: { businessId, commentId: event.commentId } })) return null;

    const commentText = event.commentText.slice(0, MAX_COMMENT_CHARS);
    const base = {
      businessId,
      platform: event.platform,
      postId: event.postId,
      commentId: event.commentId,
      fromUserId: event.fromUserId || null,
      fromUserName: event.fromUserName || null,
      commentText,
    };

    const rules = await this.ruleRepo.find({ where: { businessId, enabled: true }, order: { createdAt: 'ASC' } });
    const rule = findMatchingRule(rules, commentText, event.platform, event.postId);
    if (!rule) {
      return this.logRepo.save(this.logRepo.create({ ...base, liked: false, replied: false, status: 'ignored' }));
    }

    // Record the comment first so a webhook retry during the reply delay is recognised as a duplicate.
    const log = await this.logRepo.save(
      this.logRepo.create({ ...base, liked: false, replied: false, ruleId: rule.id, status: 'success' }),
    );

    if (rule.delaySeconds > 0) {
      await new Promise(r => setTimeout(r, Math.min(rule.delaySeconds, MAX_REPLY_DELAY_S) * 1000));
    }

    const errors: string[] = [];
    const username = event.fromUserName || 'friend';

    if (rule.autoLike && event.platform === 'facebook') {
      const res = await this.metaGraph.likeComment(event.platform, event.commentId, account.accessToken);
      log.liked = res.success;
      if (!res.success) errors.push(`Like failed: ${res.error}`);
    }

    const templates = parseList(rule.replyTemplates).filter(t => t.trim());
    let reply = await this.aiReply(rule, username, commentText);
    if (!reply && templates.length) reply = templates[Math.floor(Math.random() * templates.length)];
    if (reply) {
      reply = fill(reply, username, commentText);
      const res = await this.metaGraph.replyToComment(event.platform, event.commentId, reply, account.accessToken);
      log.replied = res.success;
      log.replyText = reply;
      if (!res.success) errors.push(`Reply failed: ${res.error}`);
    }

    if (rule.autoDm && rule.autoDmTemplate && account.pageId) {
      const res = await this.metaGraph.sendPrivateReply(
        event.commentId,
        fill(rule.autoDmTemplate, username, commentText),
        account.accessToken,
        account.pageId,
      );
      if (!res.success) errors.push(`DM failed: ${res.error}`);
    }

    await this.ruleRepo.increment({ id: rule.id }, 'triggerCount', 1);
    log.error = errors.length ? errors.join('; ').slice(0, 2000) : null;
    log.status = errors.length && !log.liked && !log.replied ? 'failed' : 'success';
    return this.logRepo.save(log);
  }

  /** Dry run from the dashboard: which rule matches and what it would send. Nothing is sent to Meta. */
  async simulateComment(businessId: string, dto: SimulateCommentDto) {
    const rules = await this.ruleRepo.find({ where: { businessId, enabled: true }, order: { createdAt: 'ASC' } });
    const platform = dto.platform || 'instagram';
    const rule = findMatchingRule(rules, dto.commentText, platform, dto.postId);
    if (!rule) return { matched: false, message: 'No enabled rule matches this comment' };

    const username = dto.fromUserName || 'TestUser';
    const templates = parseList(rule.replyTemplates).filter(t => t.trim());
    const reply = (await this.aiReply(rule, username, dto.commentText)) || templates[0] || '';
    return {
      matched: true,
      ruleName: rule.name,
      ruleId: rule.id,
      matchType: rule.matchType,
      willAutoLike: rule.autoLike && platform === 'facebook',
      willAutoDm: rule.autoDm,
      dmText: rule.autoDm && rule.autoDmTemplate ? fill(rule.autoDmTemplate, username, dto.commentText) : null,
      generatedReply: reply ? fill(reply, username, dto.commentText) : '',
      delaySeconds: rule.delaySeconds,
    };
  }

  // ── Logs & overview ──

  async listLogs(businessId: string, limit = 50): Promise<SocialCommentLog[]> {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
    return this.logRepo.find({ where: { businessId }, order: { createdAt: 'DESC' }, take });
  }

  async getOverview(businessId: string) {
    const count = <T extends object>(repo: Repository<T>, where: Record<string, unknown>) =>
      repo.count({ where: { businessId, ...where } as never });
    const [
      totalAccounts,
      connectedAccounts,
      totalPosts,
      publishedPosts,
      scheduledPosts,
      failedPosts,
      totalCommentsLogged,
      autoLikesGiven,
      autoRepliesSent,
      totalRules,
      activeRules,
      recentLogs,
    ] = await Promise.all([
      count(this.accountRepo, {}),
      count(this.accountRepo, { status: 'connected' }),
      count(this.postRepo, {}),
      count(this.postRepo, { status: 'published' }),
      count(this.postRepo, { status: 'scheduled' }),
      count(this.postRepo, { status: 'failed' }),
      count(this.logRepo, {}),
      count(this.logRepo, { liked: true }),
      count(this.logRepo, { replied: true }),
      count(this.ruleRepo, {}),
      count(this.ruleRepo, { enabled: true }),
      this.logRepo.find({ where: { businessId }, order: { createdAt: 'DESC' }, take: 5 }),
    ]);
    return {
      totalAccounts,
      connectedAccounts,
      totalPosts,
      publishedPosts,
      scheduledPosts,
      failedPosts,
      totalCommentsLogged,
      autoLikesGiven,
      autoRepliesSent,
      totalRules,
      activeRules,
      recentLogs,
      webhook: {
        secretConfigured: !!(process.env.META_APP_SECRET || process.env.CLOUD_API_APP_SECRET || '').trim(),
        lastRejected: this.lastWebhookRejection,
        lastDelivery: this.lastWebhookDelivery,
        lastUnmatched: this.lastUnmatched,
        serverStartedAt: SERVER_STARTED_AT,
      },
    };
  }

  // shortcut: kept in memory (cleared on restart, not tied to a business since the delivery was unverified).
  private lastWebhookRejection: { at: string; reason: 'signature' | 'no-secret' } | null = null;

  /** Remembers why Meta's last webhook delivery was refused, so the dashboard can explain it. */
  // shortcut: in memory like the rejection above, cleared on restart.
  private lastWebhookDelivery: { at: string; object: string; comments: number; messages: number } | null = null;
  private lastUnmatched: { at: string; platform: SocialPlatform; accountId: string } | null = null;

  /** Remembers Meta's last accepted delivery, so the dashboard can tell "nothing arrives" from "arrives but unused". */
  noteWebhookDelivery(object: string, comments: number, messages: number): void {
    this.lastWebhookDelivery = { at: new Date().toISOString(), object, comments, messages };
  }

  /** Remembers a comment or DM for an Instagram/Page ID that no connected account here matches. */
  noteUnmatchedAccount(platform: SocialPlatform, accountId: string): void {
    this.lastUnmatched = { at: new Date().toISOString(), platform, accountId };
  }

  noteWebhookRejected(reason: 'signature' | 'no-secret'): void {
    this.lastWebhookRejection = { at: new Date().toISOString(), reason };
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { MessageService } from '../message/message.service';
import { IntegrationService } from '../integrations/integration.service';
import { GoogleWorkspaceService } from '../integrations/google/google-workspace.service';
import { Integration, IntegrationType } from '../integrations/entities/integration.entity';
import { fence, UNTRUSTED_RULE } from '../sales-agent/sales-rules';
import { GbpConfig, GbpLocation, GbpReview, GbpReviewStatus } from './entities/google-business.entity';
import {
  canAutoPublish,
  DEFAULT_REVIEW_REQUEST,
  digitsOnly,
  fillTemplate,
  fromGoogleReview,
  MAX_REPLY_CHARS,
  replyProblems,
  shouldAlert,
} from './gbp-rules';

const TICK_MS = 60_000;
/** Pages of 50 read per location on the first sync; later syncs stop at the first unchanged review. */
const FIRST_SYNC_PAGES = 10;
const DRAFTS_PER_SYNC = 20;
const MAX_REQUESTS_PER_CALL = 100;
const REQUEST_GAP_MS = 1500;

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

export interface SyncSummary {
  fetched: number;
  newReviews: number;
  drafted: number;
  published: number;
  alerted: number;
  errors: string[];
}

/**
 * Google Business Profile automation: mirrors reviews, drafts AI replies, publishes them (on approval, or
 * on its own for ratings the owner allows), alerts the owner on WhatsApp about low ratings, asks customers
 * for reviews over WhatsApp and publishes profile posts.
 */
@Injectable()
export class GoogleBusinessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleBusinessService.name);
  private timer?: NodeJS.Timeout;
  private readonly running = new Set<string>();

  constructor(
    @InjectRepository(GbpConfig, 'data') private readonly configs: Repository<GbpConfig>,
    @InjectRepository(GbpReview, 'data') private readonly reviews: Repository<GbpReview>,
    private readonly google: GoogleWorkspaceService,
    private readonly integrations: IntegrationService,
    private readonly ai: AiService,
    private readonly messages: MessageService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    const due = (await this.configs.find({ where: { enabled: true } })).filter(
      c => !c.lastSyncAt || now.getTime() - c.lastSyncAt.getTime() >= c.syncMinutes * 60_000,
    );
    for (const config of due) {
      await this.sync(config, now).catch(err =>
        this.logger.error(`Google Business sync failed for ${config.businessId}: ${errMsg(err)}`),
      );
    }
  }

  // ---------------------------------------------------------------- config

  async getConfig(businessId: string): Promise<GbpConfig> {
    const existing = await this.configs.findOne({ where: { businessId } });
    if (existing) return existing;
    return this.configs.save(
      this.configs.create({
        businessId,
        enabled: false,
        integrationId: '',
        accountName: '',
        locations: [],
        autoDraft: true,
        autoPublishMinStars: 0,
        autoPublishRequiresText: false,
        tone: 'warm, professional, short',
        signature: '',
        instructions: '',
        alertSessionId: '',
        alertPhone: '',
        alertMaxStars: 3,
        syncMinutes: 30,
        reviewRequestTemplate: DEFAULT_REVIEW_REQUEST,
        lastSyncAt: null,
        lastError: '',
      }),
    );
  }

  async updateConfig(businessId: string, input: Record<string, unknown>): Promise<GbpConfig> {
    const config = await this.getConfig(businessId);
    if (input.integrationId !== undefined) {
      const id = str(input.integrationId, 36);
      if (id) await this.integration({ ...config, integrationId: id });
      if (id !== config.integrationId) {
        config.accountName = '';
        config.locations = [];
      }
      config.integrationId = id;
    }
    if (input.accountName !== undefined) config.accountName = str(input.accountName, 100);
    if (Array.isArray(input.locations)) {
      config.locations = (input.locations as Array<Record<string, unknown>>).slice(0, 100).map(l => ({
        name: str(l.name, 200),
        title: str(l.title, 200),
        address: str(l.address, 300),
        reviewUrl: str(l.reviewUrl, 500),
        mapsUrl: str(l.mapsUrl, 500),
      }));
    }
    config.enabled = bool(input.enabled, config.enabled);
    config.autoDraft = bool(input.autoDraft, config.autoDraft);
    config.autoPublishMinStars = num(input.autoPublishMinStars, 0, 5, config.autoPublishMinStars);
    config.autoPublishRequiresText = bool(input.autoPublishRequiresText, config.autoPublishRequiresText);
    if (input.tone !== undefined) config.tone = str(input.tone, 200);
    if (input.signature !== undefined) config.signature = str(input.signature, 200);
    if (input.instructions !== undefined) config.instructions = str(input.instructions, 4000);
    if (input.alertSessionId !== undefined) config.alertSessionId = str(input.alertSessionId, 100);
    if (input.alertPhone !== undefined) config.alertPhone = digitsOnly(str(input.alertPhone, 20));
    config.alertMaxStars = num(input.alertMaxStars, 0, 5, config.alertMaxStars);
    config.syncMinutes = num(input.syncMinutes, 10, 1440, config.syncMinutes);
    if (input.reviewRequestTemplate !== undefined) {
      config.reviewRequestTemplate = str(input.reviewRequestTemplate, 1000) || DEFAULT_REVIEW_REQUEST;
    }
    if (config.enabled && (!config.integrationId || !config.locations.length)) {
      throw new BadRequestException('Connect a Google account and pick at least one location before turning sync on');
    }
    return this.configs.save(config);
  }

  /** Google Business integrations of this business, for the settings picker. */
  async connections(businessId: string): Promise<Array<{ id: string; name: string; status: string }>> {
    const list = await this.integrations.findAll(businessId, IntegrationType.GOOGLE_BUSINESS);
    return list.map(i => ({ id: i.id, name: i.name, status: i.status }));
  }

  /** integrationId lets Settings browse a connection before it is saved. */
  async accounts(businessId: string, integrationId?: string) {
    const config = await this.getConfig(businessId);
    return this.google.gbpAccounts(
      await this.integration({ businessId, integrationId: integrationId || config.integrationId }),
    );
  }

  async locations(businessId: string, account: string, integrationId?: string) {
    const config = await this.getConfig(businessId);
    return this.google.gbpLocations(
      await this.integration({ businessId, integrationId: integrationId || config.integrationId }),
      account,
    );
  }

  private async integration(config: Pick<GbpConfig, 'integrationId' | 'businessId'>): Promise<Integration> {
    if (!config.integrationId) throw new BadRequestException('Pick a Google Business Profile connection first');
    const integration = await this.integrations.findOne(config.integrationId, config.businessId);
    if (integration.type !== (IntegrationType.GOOGLE_BUSINESS as string)) {
      throw new BadRequestException('That connection is not a Google Business Profile connection');
    }
    return integration;
  }

  // ---------------------------------------------------------------- sync

  async syncNow(businessId: string): Promise<SyncSummary> {
    return this.sync(await this.getConfig(businessId));
  }

  /** Pulls new and changed reviews, then drafts, auto-publishes and alerts. */
  async sync(config: GbpConfig, now = new Date()): Promise<SyncSummary> {
    if (this.running.has(config.businessId)) throw new BadRequestException('A sync is already running');
    if (!config.locations.length) throw new BadRequestException('Pick at least one location in Settings');
    this.running.add(config.businessId);
    const summary: SyncSummary = { fetched: 0, newReviews: 0, drafted: 0, published: 0, alerted: 0, errors: [] };
    try {
      const integration = await this.integration(config);
      const locations: GbpLocation[] = [];
      for (const location of config.locations) {
        try {
          locations.push(await this.syncLocation(config, integration, location, summary));
        } catch (err) {
          summary.errors.push(`${location.title || location.name}: ${errMsg(err)}`);
          locations.push(location);
        }
      }
      await this.processNew(config, integration, summary);
      await this.configs.update(config.id, {
        locations,
        lastSyncAt: now,
        lastError: summary.errors.join('\n').slice(0, 2000),
      });
      return summary;
    } finally {
      this.running.delete(config.businessId);
    }
  }

  private async syncLocation(
    config: GbpConfig,
    integration: Integration,
    location: GbpLocation,
    summary: SyncSummary,
  ): Promise<GbpLocation> {
    let pageToken = '';
    let averageRating = location.averageRating;
    let totalReviewCount = location.totalReviewCount;
    for (let page = 0; page < FIRST_SYNC_PAGES; page++) {
      const res = await this.google.gbpReviews(integration, location.name, pageToken);
      averageRating = res.averageRating || averageRating;
      totalReviewCount = res.totalReviewCount || totalReviewCount;
      let unchanged = false;
      for (const raw of res.reviews) {
        summary.fetched++;
        unchanged = !(await this.upsert(config, location, raw, summary)) || unchanged;
      }
      // Newest first: once a page holds a review we already have unchanged, older pages are known too.
      if (unchanged || !res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
    return { ...location, averageRating, totalReviewCount };
  }

  /** Saves one Google review. Returns false when nothing changed since the last sync. */
  private async upsert(
    config: GbpConfig,
    location: GbpLocation,
    raw: Record<string, unknown>,
    summary: SyncSummary,
  ): Promise<boolean> {
    const g = fromGoogleReview(raw);
    if (!g.reviewName) return true;
    const existing = await this.reviews.findOne({ where: { businessId: config.businessId, reviewName: g.reviewName } });
    if (existing && existing.reviewUpdatedAt?.getTime() === g.reviewUpdatedAt?.getTime()) {
      if (!!existing.replyText === !!g.reply) return false;
    }
    const row = existing ?? this.reviews.create({ businessId: config.businessId, reviewName: g.reviewName });
    if (!existing) summary.newReviews++;
    const edited = !!existing && existing.comment !== g.comment;
    Object.assign(row, {
      locationName: location.name,
      locationTitle: location.title,
      reviewerName: g.reviewerName,
      reviewerPhoto: g.reviewerPhoto,
      stars: g.stars,
      comment: g.comment,
      reviewedAt: g.reviewedAt,
      reviewUpdatedAt: g.reviewUpdatedAt,
    });
    if (g.reply) {
      row.replyText = g.reply.comment;
      row.repliedAt = g.reply.updatedAt;
      row.repliedBy = row.repliedBy || 'google';
      row.status = 'replied';
      row.draft = '';
    } else {
      row.replyText = '';
      row.repliedAt = null;
      // The reply was removed on Google, or the customer rewrote the review: answer it again.
      if (row.status === 'replied' || (edited && row.status !== 'skipped')) {
        row.status = 'new';
        row.draft = '';
      }
      row.status ??= 'new';
    }
    if (edited) row.alertedAt = null;
    await this.reviews.save(row);
    return true;
  }

  private async processNew(config: GbpConfig, integration: Integration, summary: SyncSummary): Promise<void> {
    const open = await this.reviews.find({
      where: [
        { businessId: config.businessId, status: 'new' },
        { businessId: config.businessId, status: 'pending_review' },
      ],
      order: { reviewedAt: 'DESC' },
      take: 200,
    });
    for (const review of open) {
      if (shouldAlert(config, review)) {
        try {
          await this.alert(config, review);
          summary.alerted++;
        } catch (err) {
          summary.errors.push(`WhatsApp alert: ${errMsg(err)}`);
        }
      }
    }
    if (!config.autoDraft) return;
    for (const review of open.filter(r => r.status === 'new').slice(0, DRAFTS_PER_SYNC)) {
      let text: string;
      try {
        text = await this.writeReply(config, review);
      } catch (err) {
        // AI outage: the review stays 'new' and is drafted on the next sync.
        summary.errors.push(`AI draft: ${errMsg(err)}`);
        break;
      }
      review.draft = text;
      review.status = 'pending_review';
      review.error = '';
      await this.reviews.save(review);
      summary.drafted++;
      if (canAutoPublish(config, review) && !replyProblems(text).length) {
        if (await this.publishRow(integration, review, text, 'autopilot')) summary.published++;
      }
    }
  }

  private async alert(config: GbpConfig, review: GbpReview): Promise<void> {
    const stars = '★'.repeat(review.stars) + '☆'.repeat(5 - review.stars);
    const text = [
      `New ${review.stars}-star Google review for ${review.locationTitle || 'your business'}`,
      stars,
      `From: ${review.reviewerName}`,
      review.comment ? `"${review.comment.slice(0, 700)}"` : '(no text)',
      'Reply from the Google Business page in the dashboard.',
    ].join('\n');
    await this.messages.sendText(config.alertSessionId, { chatId: `${config.alertPhone}@c.us`, text });
    review.alertedAt = new Date();
    await this.reviews.save(review);
  }

  // ---------------------------------------------------------------- AI

  async writeReply(
    config: GbpConfig,
    review: Pick<GbpReview, 'stars' | 'comment' | 'reviewerName' | 'locationTitle'>,
  ): Promise<string> {
    const firstName = review.reviewerName === 'A Google user' ? '' : review.reviewerName.split(/\s+/)[0];
    const guidance =
      review.stars >= 4
        ? 'Thank them warmly and mention one specific thing they liked, if they said one. Invite them back.'
        : review.stars === 3
          ? 'Thank them, acknowledge what could be better, and say briefly how you will improve.'
          : 'Apologise sincerely without arguing or blaming, do not admit legal fault, and invite them to contact the business directly to put it right (use the contact details in BUSINESS FACTS if any).';
    const { content } = await this.ai.complete(
      [
        {
          role: 'system',
          content: [
            `You are the owner of ${review.locationTitle || 'a local business'} replying publicly to a Google review.`,
            `Tone: ${config.tone || 'warm, professional, short'}.`,
            config.instructions ? `BUSINESS FACTS:\n${fence(config.instructions, 'owner-notes')}` : '',
            UNTRUSTED_RULE,
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: [
            `Rating: ${review.stars} of 5 stars.`,
            firstName ? `Reviewer first name: ${firstName}` : 'The reviewer is anonymous.',
            `Review text:\n${fence(review.comment || '(no text, rating only)', 'google-review')}`,
            guidance,
            '- Reply in the same language as the review (English if there is no text).',
            '- Under 80 words, plain text, no hashtags, no emojis, no links, no placeholders like [name].',
            '- Never offer discounts, gifts or anything in return for reviews. Never invent facts.',
            '- Do not add a signature; it is added automatically.',
            'Return ONLY the reply text.',
          ].join('\n'),
        },
      ],
      { maxTokens: 400, temperature: 0.6 },
    );
    const body = content
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
    if (!body) throw new Error('The AI returned an empty reply');
    const signature = config.signature.trim();
    return (signature ? `${body}\n\n${signature}` : body).slice(0, MAX_REPLY_CHARS);
  }

  async redraft(businessId: string, id: string): Promise<GbpReview> {
    const config = await this.getConfig(businessId);
    const review = await this.review(businessId, id);
    review.draft = await this.writeReply(config, review);
    if (review.status !== 'replied') review.status = 'pending_review';
    return this.reviews.save(review);
  }

  async saveDraft(businessId: string, id: string, text: string): Promise<GbpReview> {
    const review = await this.review(businessId, id);
    review.draft = str(text, MAX_REPLY_CHARS);
    if (review.status === 'new' || review.status === 'skipped') review.status = 'pending_review';
    return this.reviews.save(review);
  }

  // ---------------------------------------------------------------- actions

  async publish(businessId: string, id: string, text: string | undefined, by: string): Promise<GbpReview> {
    const config = await this.getConfig(businessId);
    const review = await this.review(businessId, id);
    const reply = (text ?? review.draft).trim();
    const problems = replyProblems(reply);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    const ok = await this.publishRow(await this.integration(config), review, reply, by);
    if (!ok) throw new BadRequestException(`Google did not accept the reply: ${review.error}`);
    return review;
  }

  /** Approves every waiting draft that passes the checks. */
  async publishAll(businessId: string, by: string): Promise<{ published: number; failed: number }> {
    const config = await this.getConfig(businessId);
    const integration = await this.integration(config);
    const waiting = await this.reviews.find({ where: { businessId, status: 'pending_review' }, take: 100 });
    let published = 0;
    for (const review of waiting) {
      if (review.draft.trim() && !replyProblems(review.draft).length) {
        if (await this.publishRow(integration, review, review.draft.trim(), by)) published++;
      }
    }
    return { published, failed: waiting.length - published };
  }

  private async publishRow(integration: Integration, review: GbpReview, text: string, by: string): Promise<boolean> {
    try {
      await this.google.gbpReply(integration, review.reviewName, text);
      Object.assign(review, {
        replyText: text,
        repliedAt: new Date(),
        repliedBy: by.slice(0, 100),
        status: 'replied',
        draft: '',
        error: '',
      });
      await this.reviews.save(review);
      return true;
    } catch (err) {
      review.status = 'failed';
      review.draft = text;
      review.error = errMsg(err).slice(0, 1000);
      await this.reviews.save(review);
      return false;
    }
  }

  async deleteReply(businessId: string, id: string): Promise<GbpReview> {
    const config = await this.getConfig(businessId);
    const review = await this.review(businessId, id);
    await this.google.gbpDeleteReply(await this.integration(config), review.reviewName);
    Object.assign(review, {
      draft: review.replyText,
      replyText: '',
      repliedAt: null,
      repliedBy: '',
      status: 'pending_review',
    });
    return this.reviews.save(review);
  }

  async setSkipped(businessId: string, id: string, skipped: boolean): Promise<GbpReview> {
    const review = await this.review(businessId, id);
    if (review.status === 'replied') throw new BadRequestException('This review is already answered');
    review.status = skipped ? 'skipped' : review.draft ? 'pending_review' : 'new';
    return this.reviews.save(review);
  }

  private async review(businessId: string, id: string): Promise<GbpReview> {
    const review = await this.reviews.findOne({ where: { id, businessId } });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  // ---------------------------------------------------------------- reads

  async list(businessId: string, filter: { status?: string; stars?: number; location?: string; search?: string }) {
    const qb = this.reviews
      .createQueryBuilder('r')
      .where('r.businessId = :businessId', { businessId })
      .orderBy('r.reviewedAt', 'DESC')
      .take(200);
    if (filter.status) qb.andWhere('r.status = :status', { status: filter.status });
    if (filter.stars) qb.andWhere('r.stars = :stars', { stars: filter.stars });
    if (filter.location) qb.andWhere('r.locationName = :location', { location: filter.location });
    if (filter.search) {
      qb.andWhere('(LOWER(r.comment) LIKE :q OR LOWER(r.reviewerName) LIKE :q)', {
        q: `%${filter.search.toLowerCase().slice(0, 100)}%`,
      });
    }
    return qb.getMany();
  }

  async overview(businessId: string) {
    const config = await this.getConfig(businessId);
    const rows = await this.reviews.find({
      where: { businessId },
      select: { stars: true, status: true, reviewedAt: true, repliedAt: true, repliedBy: true },
    });
    const byStars = [1, 2, 3, 4, 5].map(s => rows.filter(r => r.stars === s).length);
    const rated = rows.filter(r => r.stars > 0);
    const count = (status: GbpReviewStatus) => rows.filter(r => r.status === status).length;
    const monthAgo = Date.now() - 30 * 86_400_000;
    const responseHours = rows
      .filter(r => r.repliedBy !== 'google' && r.repliedAt && r.reviewedAt)
      .map(r => (r.repliedAt!.getTime() - r.reviewedAt!.getTime()) / 3_600_000)
      .filter(h => h >= 0);
    return {
      enabled: config.enabled,
      connected: !!config.integrationId,
      locations: config.locations,
      lastSyncAt: config.lastSyncAt,
      lastError: config.lastError,
      total: rows.length,
      average: rated.length ? Math.round((rated.reduce((s, r) => s + r.stars, 0) / rated.length) * 10) / 10 : 0,
      byStars,
      replied: count('replied'),
      waiting: count('pending_review'),
      unanswered: count('new'),
      failed: count('failed'),
      autoReplied: rows.filter(r => r.repliedBy === 'autopilot').length,
      responseRate: rows.length ? Math.round((count('replied') / rows.length) * 100) : 0,
      avgResponseHours: responseHours.length
        ? Math.round(responseHours.reduce((a, b) => a + b, 0) / responseHours.length)
        : null,
      last30Days: rows.filter(r => (r.reviewedAt?.getTime() ?? 0) >= monthAgo).length,
    };
  }

  // ---------------------------------------------------------------- growth

  /** Sends each customer a WhatsApp message with the location's Google review link. */
  async requestReviews(
    businessId: string,
    input: {
      sessionId?: string;
      locationName?: string;
      message?: string;
      contacts?: Array<{ name?: string; phone?: string }>;
    },
  ): Promise<{ sent: number; failed: Array<{ phone: string; error: string }> }> {
    const config = await this.getConfig(businessId);
    const sessionId = str(input.sessionId, 100);
    if (!sessionId) throw new BadRequestException('Pick the WhatsApp number to send from');
    const location = config.locations.find(l => l.name === input.locationName) ?? config.locations[0];
    if (!location?.reviewUrl) {
      throw new BadRequestException('This location has no review link yet. Pick it again in Settings to refresh it.');
    }
    const template = str(input.message, 1000) || config.reviewRequestTemplate || DEFAULT_REVIEW_REQUEST;
    const contacts = (Array.isArray(input.contacts) ? input.contacts : [])
      .map(c => ({ name: str(c?.name, 100), phone: digitsOnly(str(c?.phone, 30)) }))
      .filter(c => c.phone.length >= 8 && c.phone.length <= 15);
    if (!contacts.length) throw new BadRequestException('Add at least one phone number with country code');
    if (contacts.length > MAX_REQUESTS_PER_CALL) {
      throw new BadRequestException(`Send to at most ${MAX_REQUESTS_PER_CALL} people at a time`);
    }
    const failed: Array<{ phone: string; error: string }> = [];
    let sent = 0;
    for (const [i, c] of contacts.entries()) {
      // Spaced out so a batch does not look like spam to WhatsApp.
      if (i > 0) await new Promise(r => setTimeout(r, REQUEST_GAP_MS));
      try {
        const text = fillTemplate(template, { name: c.name.split(/\s+/)[0], link: location.reviewUrl });
        await this.messages.sendText(sessionId, { chatId: `${c.phone}@c.us`, text });
        sent++;
      } catch (err) {
        failed.push({ phone: c.phone, error: errMsg(err) });
      }
    }
    return { sent, failed };
  }

  async writePost(businessId: string, topic: string): Promise<{ summary: string }> {
    const config = await this.getConfig(businessId);
    const about = str(topic, 1000);
    if (!about) throw new BadRequestException('Say what the post is about');
    const { content } = await this.ai.complete(
      [
        {
          role: 'system',
          content: [
            `You write Google Business Profile updates for ${config.locations[0]?.title || 'a local business'}.`,
            config.instructions ? `BUSINESS FACTS:\n${fence(config.instructions, 'owner-notes')}` : '',
            UNTRUSTED_RULE,
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: `Write one post about:\n${fence(about, 'owner-topic')}\n- 60 to 150 words, friendly, plain text, at most 2 emojis, no phone numbers or links (Google rejects them in the text), end with a clear next step.\nReturn ONLY the post text.`,
        },
      ],
      { maxTokens: 500, temperature: 0.8 },
    );
    return { summary: content.trim().slice(0, 1500) };
  }

  async createPost(
    businessId: string,
    input: { summary?: string; url?: string; locationNames?: string[] },
  ): Promise<{ posted: string[]; failed: Array<{ location: string; error: string }> }> {
    const config = await this.getConfig(businessId);
    const summary = str(input.summary, 1500);
    if (!summary) throw new BadRequestException('Write the post text');
    const url = str(input.url, 500);
    if (url && !/^https:\/\/\S+$/i.test(url)) throw new BadRequestException('The button link must start with https://');
    const wanted = Array.isArray(input.locationNames) && input.locationNames.length ? input.locationNames : null;
    const targets = config.locations.filter(l => !wanted || wanted.includes(l.name));
    if (!targets.length) throw new BadRequestException('Pick at least one location');
    const integration = await this.integration(config);
    const posted: string[] = [];
    const failed: Array<{ location: string; error: string }> = [];
    for (const l of targets) {
      try {
        await this.google.gbpCreatePost(integration, l.name, { summary, url: url || undefined });
        posted.push(l.title || l.name);
      } catch (err) {
        failed.push({ location: l.title || l.name, error: errMsg(err) });
      }
    }
    return { posted, failed };
  }
}

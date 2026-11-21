import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IntegrationType } from '../../integrations/entities/integration.entity';
import { GoogleWorkspaceService } from '../../integrations/google/google-workspace.service';
import { IntegrationService } from '../../integrations/integration.service';
import { loadRemoteMediaBuffer } from '../../../common/media/load-remote-media';
import type { SocialAccount } from '../entities/social-automation.entity';
import type { IncomingComment } from '../social-automation.service';

const MAX_PAGES = 5;
const LOOKBACK_MS = 60 * 60_000;
// Fetch from slightly before the last poll started so no comment slips between two polls (repeats are logged and skipped).
const OVERLAP_MS = 60_000;

const publishedAt = (item?: Record<string, unknown>): Date | null => {
  const top = (item?.snippet as { topLevelComment?: { snippet?: { publishedAt?: string } } } | undefined)
    ?.topLevelComment;
  const d = new Date(top?.snippet?.publishedAt ?? '');
  return Number.isNaN(d.getTime()) ? null : d;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/**
 * commentThreads items -> comments worth answering: posted after the account was connected (so connecting
 * never replies to old comments) and not answered yet by anyone (totalReplyCount 0).
 */
export function toIncomingComments(
  items: Array<Record<string, unknown>>,
  channelId: string,
  since: Date,
): IncomingComment[] {
  const out: IncomingComment[] = [];
  for (const item of items) {
    const thread = obj(item.snippet);
    const top = obj(thread.topLevelComment);
    const c = obj(top.snippet);
    const publishedAt = new Date(str(c.publishedAt));
    const text = str(c.textDisplay) || str(c.textOriginal);
    if (!str(top.id) || !text.trim() || Number(thread.totalReplyCount) > 0) continue;
    if (Number.isNaN(publishedAt.getTime()) || publishedAt < since) continue;
    out.push({
      platform: 'youtube',
      targetAccountId: channelId,
      commentId: str(top.id),
      commentText: text,
      postId: str(thread.videoId),
      fromUserId: str(obj(c.authorChannelId).value) || undefined,
      fromUserName: str(c.authorDisplayName) || undefined,
    });
  }
  return out;
}

/** YouTube access for a connected SocialAccount: it holds the id of a google_youtube integration in pageId. */
@Injectable()
export class SocialYoutubeService {
  private readonly logger = new Logger(SocialYoutubeService.name);

  constructor(
    private readonly google: GoogleWorkspaceService,
    private readonly integrations: IntegrationService,
  ) {}

  private async integration(businessId: string, integrationId: string | null) {
    if (!integrationId) throw new BadRequestException('Pick a YouTube connection first');
    const integration = await this.integrations.findOne(integrationId, businessId);
    if (integration.type !== (IntegrationType.GOOGLE_YOUTUBE as string)) {
      throw new BadRequestException('That connection is not a YouTube connection');
    }
    return integration;
  }

  async channel(businessId: string, integrationId: string | null) {
    return this.google.youtubeChannel(await this.integration(businessId, integrationId));
  }

  // shortcut: in memory, so after a restart the first poll looks back one hour; persist a marker if that gap matters.
  private readonly lastPoll = new Map<string, number>();

  /** Walks newest-first pages until it reaches comments older than the last poll (at most MAX_PAGES, 1 quota unit each). */
  async newComments(account: SocialAccount, now = Date.now()): Promise<IncomingComment[]> {
    const integration = await this.integration(account.businessId, account.pageId);
    const since = new Date(Math.max(account.createdAt.getTime(), this.lastPoll.get(account.id) ?? now - LOOKBACK_MS));
    const items: Array<Record<string, unknown>> = [];
    let pageToken = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.google.youtubeComments(integration, account.accountId, pageToken);
      items.push(...res.items);
      const oldest = publishedAt(res.items.at(-1));
      pageToken = res.nextPageToken;
      if (!pageToken || (oldest && oldest < since)) break;
      if (page === MAX_PAGES - 1) {
        this.logger.warn(`YouTube ${account.accountName}: over ${MAX_PAGES * 50} new comments, older ones skipped`);
      }
    }
    this.lastPoll.set(account.id, now - OVERLAP_MS);
    return toIncomingComments(items, account.accountId, since);
  }

  /** Uploads the post's video (downloaded through the SSRF-guarded loader) as a public video; returns the video id. */
  async upload(account: SocialAccount, caption: string, mediaUrl: string): Promise<string> {
    const integration = await this.integration(account.businessId, account.pageId);
    const { data, mimetype } = await loadRemoteMediaBuffer(mediaUrl);
    const [first, ...rest] = caption.trim().split('\n');
    return this.google.youtubeUpload(integration, {
      // YouTube titles are limited to 100 characters.
      title: first.trim().slice(0, 100) || 'Untitled',
      description: rest.join('\n').trim(),
      data,
      mimetype: mimetype.startsWith('video/') ? mimetype : 'application/octet-stream',
    });
  }

  async reply(account: SocialAccount, commentId: string, text: string): Promise<void> {
    await this.google.youtubeReply(await this.integration(account.businessId, account.pageId), commentId, text);
  }
}

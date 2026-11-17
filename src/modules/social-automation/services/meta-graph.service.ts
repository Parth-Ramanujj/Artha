import { Injectable, Logger } from '@nestjs/common';
import type { SocialMediaType, SocialPlatform } from '../entities/social-automation.entity';

export interface MetaPublishResult {
  remotePostId: string;
  permalink?: string;
  success: boolean;
  error?: string;
}

export interface MetaReplyResult {
  replyId: string;
  success: boolean;
  error?: string;
}

type GraphResponse = Record<string, unknown> & { id?: string; error?: { message?: string; code?: number } };

const GRAPH = 'https://graph.facebook.com/v21.0';
const REQUEST_TIMEOUT_MS = 20_000;
// Reels containers transcode before they can be published; Meta suggests polling status_code.
const VIDEO_POLL_MS = 5_000;
const VIDEO_POLL_ATTEMPTS = 36; // ~3 minutes

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

@Injectable()
export class MetaGraphService {
  private readonly logger = new Logger(MetaGraphService.name);

  /** Calls the Graph API and throws with Meta's own error message on failure. */
  private async graph(
    method: 'GET' | 'POST',
    path: string,
    accessToken: string,
    params: Record<string, string> = {},
    jsonBody?: unknown,
  ): Promise<GraphResponse> {
    const qs = new URLSearchParams({ ...params, access_token: accessToken });
    const res = await fetch(`${GRAPH}/${path}?${qs.toString()}`, {
      method,
      headers: jsonBody ? { 'Content-Type': 'application/json' } : undefined,
      body: jsonBody ? JSON.stringify(jsonBody) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as GraphResponse;
    if (!res.ok || data.error) {
      const code = data.error?.code;
      let message = data.error?.message || `HTTP ${res.status}`;
      if (code === 200 || code === 10) {
        message +=
          ' — the access token is missing a permission (pages_manage_posts, instagram_content_publish, instagram_manage_comments or pages_manage_engagement).';
      }
      throw new Error(message);
    }
    return data;
  }

  /**
   * Checks the token can read the account and returns its display name. For a Facebook Page the
   * response also carries the Page access token when the given token is a User token.
   */
  async verifyAccountToken(
    platform: SocialPlatform,
    accountId: string,
    accessToken: string,
  ): Promise<{ valid: boolean; name?: string; pageAccessToken?: string; error?: string }> {
    if (this.isTestToken(accessToken)) return { valid: true, name: `${platform} demo account` };
    try {
      const fields = platform === 'facebook' ? 'id,name,access_token' : 'id,username,name';
      const data = await this.graph('GET', encodeURIComponent(accountId), accessToken, { fields });
      const name = text(data.name) || text(data.username) || accountId;
      const pageAccessToken = typeof data.access_token === 'string' ? data.access_token : undefined;
      return { valid: true, name, pageAccessToken };
    } catch (err) {
      this.logger.warn(`Meta token check failed for ${platform} account ${accountId}: ${errMsg(err)}`);
      return { valid: false, error: errMsg(err) };
    }
  }

  /**
   * Full connect: checks the token, swaps a User token for the Page token (publishing, comment
   * replies and DMs all need the Page token), then subscribes the Page to this Meta app. Without
   * that subscription Meta sends no comment webhooks, for the Page or its linked Instagram account.
   */
  async connectAccount(
    platform: SocialPlatform,
    accountId: string,
    accessToken: string,
    pageId: string | null,
  ): Promise<{ valid: boolean; name?: string; pageAccessToken?: string; error?: string; webhookError?: string }> {
    const check = await this.verifyAccountToken(platform, accountId, accessToken);
    if (!check.valid || !pageId || this.isTestToken(accessToken)) return check;

    let pageToken = check.pageAccessToken;
    if (!pageToken && platform === 'instagram') {
      try {
        const page = await this.graph('GET', encodeURIComponent(pageId), accessToken, { fields: 'access_token' });
        pageToken = typeof page.access_token === 'string' ? page.access_token : undefined;
      } catch {
        // Already a Page token (or no Page role): keep the token as given.
      }
    }

    try {
      // `feed` is required by the API; the Instagram `comments` field rides on the same Page subscription.
      await this.graph('POST', `${encodeURIComponent(pageId)}/subscribed_apps`, pageToken || accessToken, {
        subscribed_fields: 'feed',
      });
      return { ...check, pageAccessToken: pageToken };
    } catch (err) {
      this.logger.warn(`Subscribing Page ${pageId} to webhooks failed: ${errMsg(err)}`);
      return { ...check, pageAccessToken: pageToken, webhookError: errMsg(err) };
    }
  }

  async publishToInstagram(
    igUserId: string,
    accessToken: string,
    mediaUrl: string,
    caption: string,
    mediaType: SocialMediaType = 'IMAGE',
  ): Promise<MetaPublishResult> {
    if (this.isTestToken(accessToken)) {
      const id = `mock_ig_${Date.now()}`;
      return { remotePostId: id, permalink: `https://www.instagram.com/p/${id}/`, success: true };
    }
    try {
      const user = encodeURIComponent(igUserId);
      const media: Record<string, string> =
        mediaType === 'VIDEO' ? { media_type: 'REELS', video_url: mediaUrl } : { image_url: mediaUrl };
      const container = await this.graph('POST', `${user}/media`, accessToken, { caption, ...media });
      if (!container.id) throw new Error('Meta did not return a media container id');

      if (mediaType === 'VIDEO') await this.waitForContainer(container.id, accessToken);

      const published = await this.graph('POST', `${user}/media_publish`, accessToken, { creation_id: container.id });
      if (!published.id) throw new Error('Meta did not return the published media id');

      let permalink: string | undefined;
      try {
        const info = await this.graph('GET', encodeURIComponent(published.id), accessToken, { fields: 'permalink' });
        permalink = typeof info.permalink === 'string' ? info.permalink : undefined;
      } catch {
        // The post is live; a missing permalink is cosmetic.
      }
      return { remotePostId: published.id, permalink, success: true };
    } catch (err) {
      this.logger.error(`Instagram publish failed: ${errMsg(err)}`);
      return { remotePostId: '', success: false, error: errMsg(err) };
    }
  }

  private async waitForContainer(containerId: string, accessToken: string): Promise<void> {
    for (let i = 0; i < VIDEO_POLL_ATTEMPTS; i++) {
      const info = await this.graph('GET', encodeURIComponent(containerId), accessToken, { fields: 'status_code' });
      if (info.status_code === 'FINISHED') return;
      if (info.status_code === 'ERROR' || info.status_code === 'EXPIRED') {
        throw new Error(`Instagram could not process the video (status ${String(info.status_code)})`);
      }
      await new Promise(r => setTimeout(r, VIDEO_POLL_MS));
    }
    throw new Error('Instagram is still processing the video; try publishing again in a few minutes');
  }

  async publishToFacebook(
    pageId: string,
    accessToken: string,
    mediaUrl: string,
    caption: string,
    mediaType: SocialMediaType = 'IMAGE',
  ): Promise<MetaPublishResult> {
    if (this.isTestToken(accessToken)) {
      const id = `mock_fb_${Date.now()}`;
      return { remotePostId: id, permalink: `https://www.facebook.com/${id}`, success: true };
    }
    try {
      const page = encodeURIComponent(pageId);
      const data =
        mediaType === 'VIDEO'
          ? await this.graph('POST', `${page}/videos`, accessToken, { file_url: mediaUrl, description: caption })
          : await this.graph('POST', `${page}/photos`, accessToken, { url: mediaUrl, message: caption });
      const remotePostId = text(data.post_id) || text(data.id);
      if (!remotePostId) throw new Error('Meta did not return a post id');
      return { remotePostId, permalink: `https://www.facebook.com/${remotePostId}`, success: true };
    } catch (err) {
      this.logger.error(`Facebook publish failed: ${errMsg(err)}`);
      return { remotePostId: '', success: false, error: errMsg(err) };
    }
  }

  /** Likes a comment. Only Facebook Page comments support likes; Instagram's API has no comment-like endpoint. */
  async likeComment(
    platform: SocialPlatform,
    commentId: string,
    accessToken: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (platform === 'instagram') {
      return { success: false, error: 'Instagram does not allow liking comments through its API' };
    }
    if (this.isTestToken(accessToken)) return { success: true };
    try {
      await this.graph('POST', `${encodeURIComponent(commentId)}/likes`, accessToken);
      return { success: true };
    } catch (err) {
      this.logger.warn(`Like comment ${commentId} failed: ${errMsg(err)}`);
      return { success: false, error: errMsg(err) };
    }
  }

  async replyToComment(
    platform: SocialPlatform,
    commentId: string,
    message: string,
    accessToken: string,
  ): Promise<MetaReplyResult> {
    if (this.isTestToken(accessToken)) return { replyId: `mock_reply_${Date.now()}`, success: true };
    try {
      // Instagram replies live on /replies; Facebook Page comment replies are nested /comments.
      const edge = platform === 'instagram' ? 'replies' : 'comments';
      const data = await this.graph('POST', `${encodeURIComponent(commentId)}/${edge}`, accessToken, { message });
      if (!data.id) throw new Error('Meta did not return a reply id');
      return { replyId: data.id, success: true };
    } catch (err) {
      this.logger.error(`Reply to comment ${commentId} failed: ${errMsg(err)}`);
      return { replyId: '', success: false, error: errMsg(err) };
    }
  }

  /** Private reply: one DM to the commenter, sent from the Page (also used for the linked Instagram account). */
  async sendPrivateReply(
    commentId: string,
    message: string,
    accessToken: string,
    pageId: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isTestToken(accessToken)) return { success: true };
    try {
      await this.graph(
        'POST',
        `${encodeURIComponent(pageId)}/messages`,
        accessToken,
        {},
        {
          recipient: { comment_id: commentId },
          message: { text: message },
        },
      );
      return { success: true };
    } catch (err) {
      this.logger.warn(`Private reply to comment ${commentId} failed: ${errMsg(err)}`);
      return { success: false, error: errMsg(err) };
    }
  }

  /** Demo tokens (mock_/test_/demo_) skip Meta entirely, outside production only. */
  isTestToken(token?: string): boolean {
    if (!token || process.env.NODE_ENV === 'production') return false;
    return /^(mock|test|demo)_/i.test(token.trim());
  }
}

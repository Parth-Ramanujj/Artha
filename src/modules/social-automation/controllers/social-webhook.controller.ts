import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHmac } from 'node:crypto';
import * as express from 'express';
import { constantTimeEqual } from '../../../common/security/constantTimeEqual';
import { Public } from '../../auth/decorators/auth.decorators';
import { dashboardBaseFor } from '../../integrations/google/google.controller';
import type { SocialPlatform } from '../entities/social-automation.entity';
import { MetaGraphService } from '../services/meta-graph.service';
import { IncomingComment, SocialAutomationService } from '../social-automation.service';
import { IncomingMessage, SocialInboxService } from '../social-inbox.service';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** Pulls new comments out of a Meta webhook payload (Instagram `comments`, Facebook Page `feed`). */
export function extractComments(payload: Obj): IncomingComment[] {
  const platform: SocialPlatform | null =
    payload.object === 'instagram' ? 'instagram' : payload.object === 'page' ? 'facebook' : null;
  if (!platform) return [];
  const out: IncomingComment[] = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    const targetAccountId = str(obj(entry).id);
    const changes = obj(entry).changes;
    for (const change of Array.isArray(changes) ? changes : []) {
      const field = str(obj(change).field);
      const v = obj(obj(change).value);
      const from = obj(v.from);
      if (platform === 'instagram' && field === 'comments') {
        out.push({
          platform,
          targetAccountId,
          commentId: str(v.id),
          commentText: str(v.text),
          postId: str(obj(v.media).id),
          fromUserId: str(from.id) || undefined,
          fromUserName: str(from.username) || undefined,
        });
      } else if (platform === 'facebook' && field === 'feed' && v.item === 'comment' && v.verb === 'add') {
        out.push({
          platform,
          targetAccountId,
          commentId: str(v.comment_id),
          commentText: str(v.message),
          postId: str(v.post_id),
          fromUserId: str(from.id) || undefined,
          fromUserName: str(from.name) || undefined,
        });
      }
    }
  }
  return out.filter(c => c.targetAccountId && c.commentId && c.commentText.trim());
}

/** Pulls DMs out of a Meta webhook payload (Instagram `messages`, Facebook Page / Messenger `messages`). */
export function extractMessages(payload: Obj): IncomingMessage[] {
  const platform: SocialPlatform | null =
    payload.object === 'instagram' ? 'instagram' : payload.object === 'page' ? 'facebook' : null;
  if (!platform) return [];
  const out: IncomingMessage[] = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    const targetAccountId = str(obj(entry).id);
    const events = obj(entry).messaging;
    for (const event of Array.isArray(events) ? events : []) {
      const e = obj(event);
      const message = obj(e.message);
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      out.push({
        platform,
        targetAccountId,
        senderId: str(obj(e.sender).id),
        recipientId: str(obj(e.recipient).id),
        mid: str(message.mid),
        text: str(message.text),
        mediaUrl: str(obj(obj(attachments[0]).payload).url) || undefined,
        isEcho: message.is_echo === true,
      });
    }
  }
  // Reads, reactions and deletions carry no message id or content: not inbox messages.
  return out.filter(m => m.targetAccountId && m.mid && m.senderId && m.recipientId && (m.text || m.mediaUrl));
}

const TELEGRAM_MEDIA: Array<[string, string]> = [
  ['photo', '[📷 Photo]'],
  ['video', '[🎬 Video]'],
  ['voice', '[🎤 Voice message]'],
  ['audio', '[🎵 Audio]'],
  ['document', '[📎 File]'],
  ['sticker', '[Sticker]'],
];

/** Pulls a private-chat DM out of a Telegram update. Groups and bots are skipped. */
export function extractTelegramMessage(update: Obj, botId: string): IncomingMessage | null {
  const m = obj(update.message);
  const chat = obj(m.chat);
  const from = obj(m.from);
  // shortcut: customer files are not downloaded (Telegram file links carry the bot token); the inbox shows what came.
  const kind = TELEGRAM_MEDIA.find(([field]) => m[field] !== undefined)?.[1];
  const text = str(m.text) || [kind, str(m.caption)].filter(Boolean).join(' ');
  if (chat.type !== 'private' || from.is_bot === true || !text || !str(chat.id) || !str(m.message_id)) return null;
  const name = [str(from.first_name), str(from.last_name)].filter(Boolean).join(' ') || str(from.username);
  return {
    platform: 'telegram',
    targetAccountId: botId,
    senderId: str(chat.id),
    recipientId: botId,
    mid: `${str(chat.id)}:${str(m.message_id)}`,
    text,
    customerName: name || undefined,
    isEcho: false,
  };
}

/**
 * Meta webhook for Instagram and Facebook Page comments and DMs. Configure in the Meta app with the callback
 * URL `<api>/api/social-automation/webhook`, a verify token from a connected account, and set
 * META_APP_SECRET so every delivery's X-Hub-Signature-256 is checked.
 */
@ApiExcludeController()
@Controller('social-automation/webhook')
export class SocialWebhookController {
  private readonly logger = new Logger(SocialWebhookController.name);
  private readonly appSecret: string;

  constructor(
    private readonly socialService: SocialAutomationService,
    private readonly metaGraph: MetaGraphService,
    private readonly inbox: SocialInboxService,
    config: ConfigService,
  ) {
    this.appSecret = (config.get<string>('META_APP_SECRET') || config.get<string>('CLOUD_API_APP_SECRET') || '').trim();
  }

  @Public()
  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: express.Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/plain');
    if (
      mode === 'subscribe' &&
      /^[\w-]{1,200}$/.test(challenge ?? '') &&
      (await this.socialService.isKnownVerifyToken(token))
    ) {
      res.status(HttpStatus.OK).send(challenge);
      return;
    }
    this.logger.warn('Meta social webhook verification rejected');
    res.status(HttpStatus.FORBIDDEN).send('Verification failed');
  }

  /** Files Meta downloads (post photos, DM attachments); ids are random and expire in minutes. */
  @Public()
  @Get('media/:file')
  media(@Param('file') file: string, @Res() res: express.Response): void {
    const hit = this.metaGraph.getHostedMedia(file.replace(/\.[a-z0-9]+$/i, ''));
    if (!hit) {
      res.status(HttpStatus.NOT_FOUND).send('Not found');
      return;
    }
    const { data, mimetype } = hit;
    // Uploaded files are served from our own domain: only media and PDFs render, anything else (HTML, SVG) downloads.
    const inline = /^(image\/(jpeg|png|gif|webp)|video\/|audio\/|application\/pdf$)/i.test(mimetype);
    res.setHeader('Content-Type', inline ? mimetype : 'application/octet-stream');
    if (!inline) res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.status(HttpStatus.OK).send(data);
  }

  /** LinkedIn sends the browser here after the member approves; the one-time state ties it to the business. */
  @Public()
  @Get('linkedin/callback')
  async linkedinCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error_description') error: string | undefined,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ): Promise<void> {
    const back = (base: string, query: string) => res.redirect(`${base}/social-automation?${query}`);
    const fallback = dashboardBaseFor(req);
    if (error || !code || !state) {
      return back(fallback, `linkedin=error&message=${encodeURIComponent(error ?? 'Sign-in was cancelled')}`);
    }
    try {
      const { returnTo } = await this.socialService.completeLinkedin(code, state);
      return back(returnTo || fallback, 'linkedin=connected');
    } catch (err) {
      return back(fallback, `linkedin=error&message=${encodeURIComponent((err as Error).message)}`);
    }
  }

  /** Telegram delivery for one connected bot; authenticated by the secret set with setWebhook. */
  @Public()
  @Post('telegram/:accountId')
  @HttpCode(HttpStatus.OK)
  async receiveTelegram(
    @Param('accountId') accountId: string,
    @Body() update: Obj,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ): Promise<string> {
    if (!(await this.socialService.isTelegramWebhookValid(accountId, secret))) {
      this.socialService.noteWebhookRejected('signature');
      throw new ForbiddenException('Invalid webhook secret');
    }
    const botId = await this.socialService.telegramBotId(accountId);
    const message = botId ? extractTelegramMessage(update, botId) : null;
    this.socialService.noteWebhookDelivery('telegram', 0, message ? 1 : 0);
    if (message) {
      this.inbox.handleIncomingMessage(message).catch((err: unknown) => {
        this.logger.error(`Message ${message.mid} failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    return 'OK';
  }

  private signatureOk(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!this.appSecret) {
      // Without the secret anyone could post fake comments and make us reply/DM, so production refuses.
      return process.env.NODE_ENV !== 'production';
    }
    if (!rawBody || !signature) return false;
    const expected = 'sha256=' + createHmac('sha256', this.appSecret).update(rawBody).digest('hex');
    return constantTimeEqual(signature, expected);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  receive(@Body() payload: Obj, @Req() req: express.Request): string {
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
    if (!this.signatureOk(rawBody, req.headers['x-hub-signature-256'] as string | undefined)) {
      const reason = this.appSecret ? 'signature' : 'no-secret';
      this.socialService.noteWebhookRejected(reason);
      this.logger.warn(
        this.appSecret
          ? 'Meta social webhook signature check failed'
          : 'META_APP_SECRET is not set; Meta social webhook refused',
      );
      throw new ForbiddenException('Invalid webhook signature');
    }

    // Acknowledge at once (Meta retries slow responses); replies run in the background.
    const comments = extractComments(payload);
    const messages = extractMessages(payload);
    this.socialService.noteWebhookDelivery(str(payload.object), comments.length, messages.length);
    for (const comment of comments) {
      this.socialService.handleIncomingComment(comment).catch((err: unknown) => {
        this.logger.error(`Comment ${comment.commentId} failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    for (const message of messages) {
      this.inbox.handleIncomingMessage(message).catch((err: unknown) => {
        this.logger.error(`Message ${message.mid} failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    return 'EVENT_RECEIVED';
  }
}

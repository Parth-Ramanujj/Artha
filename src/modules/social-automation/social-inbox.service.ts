import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialAccount, SocialMessage, SocialPlatform } from './entities/social-automation.entity';
import { MetaGraphService } from './services/meta-graph.service';
import { SocialAutomationService } from './social-automation.service';

/** One message from a Meta `messaging` webhook entry (Instagram DM or Messenger). */
export interface IncomingMessage {
  platform: SocialPlatform;
  /** entry.id: the Instagram account ID or the Page ID the webhook is for. */
  targetAccountId: string;
  senderId: string;
  recipientId: string;
  mid: string;
  text: string;
  mediaUrl?: string;
  /** true when the business sent it (from the Instagram/Messenger app or through us). */
  isEcho: boolean;
}

export interface InboxThread {
  accountId: string;
  accountName: string;
  threadId: string;
  customerName: string | null;
  lastText: string;
  lastDirection: 'in' | 'out';
  lastAt: Date;
}

// shortcut: threads are grouped from the newest 1000 messages; move to a SQL GROUP BY if inboxes grow past that.
const THREAD_SCAN = 1000;

@Injectable()
export class SocialInboxService {
  private readonly logger = new Logger(SocialInboxService.name);

  constructor(
    @InjectRepository(SocialAccount, 'data')
    private readonly accountRepo: Repository<SocialAccount>,
    @InjectRepository(SocialMessage, 'data')
    private readonly messageRepo: Repository<SocialMessage>,
    private readonly metaGraph: MetaGraphService,
    private readonly social: SocialAutomationService,
  ) {}

  private accountWithToken() {
    return this.accountRepo.createQueryBuilder('a').addSelect('a.accessToken');
  }

  /** Stores a webhook message once (Meta retries and echoes our own sends). Unknown accounts are skipped. */
  async handleIncomingMessage(event: IncomingMessage): Promise<SocialMessage | null> {
    const account = await this.accountWithToken()
      .where('a.accountId = :accountId AND a.platform = :platform', {
        accountId: event.targetAccountId,
        platform: event.platform,
      })
      .getOne();
    if (!account) {
      this.social.noteUnmatchedAccount(event.platform, event.targetAccountId);
      return null;
    }
    if (await this.messageRepo.exists({ where: { remoteMessageId: event.mid } })) return null;

    const threadId = event.isEcho ? event.recipientId : event.senderId;
    const named = await this.messageRepo.findOne({
      where: { accountId: account.id, threadId },
      order: { createdAt: 'DESC' },
    });
    const customerName =
      named?.customerName ??
      (event.isEcho
        ? null
        : ((await this.metaGraph.customerName(event.platform, threadId, account.accessToken)) ?? null));

    let saved: SocialMessage;
    try {
      saved = await this.messageRepo.save(
        this.messageRepo.create({
          businessId: account.businessId,
          accountId: account.id,
          platform: event.platform,
          threadId,
          customerName,
          direction: event.isEcho ? 'out' : 'in',
          text: event.text || null,
          mediaUrl: event.mediaUrl || null,
          remoteMessageId: event.mid,
          // Explicit ms timestamp: SQLite CURRENT_TIMESTAMP is whole seconds, which misorders quick replies.
          createdAt: new Date(),
        }),
      );
    } catch (err) {
      // Two deliveries of the same mid racing past the exists() check: the unique index keeps one.
      this.logger.debug(`Message ${event.mid} not stored: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    if (saved.direction === 'in' && saved.text) {
      await this.autoReply(account, saved).catch((err: unknown) => {
        this.logger.warn(`Auto-reply to ${saved.threadId} failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    return saved;
  }

  /** Answers a customer DM when an enabled rule covers DMs; the recent chat goes to the AI as context. */
  private async autoReply(account: SocialAccount, msg: SocialMessage): Promise<void> {
    const thread = { accountId: account.id, threadId: msg.threadId };
    const recent = await this.messageRepo.find({ where: thread, order: { createdAt: 'DESC' }, take: 10 });
    const chat = recent
      .reverse()
      .filter(m => m.text)
      .map(m => ({ from: m.direction === 'in' ? ('customer' as const) : ('business' as const), text: m.text ?? '' }));
    const name = msg.customerName?.replace(/^@/, '') || 'friend';
    const auto = await this.social.dmAutoReply(account.businessId, account.platform, name, chat);
    if (!auto) return;
    if (auto.delaySeconds > 0) await new Promise(r => setTimeout(r, auto.delaySeconds * 1000));
    // Someone answered by hand, or the customer wrote again, during the delay: don't talk over it.
    const latest = await this.messageRepo.findOne({ where: thread, order: { createdAt: 'DESC' } });
    if (latest && latest.id !== msg.id) return;
    await this.sendMessage(account.businessId, account.id, msg.threadId, auto.reply);
  }

  async listThreads(businessId: string, platform: SocialPlatform): Promise<InboxThread[]> {
    const [messages, accounts] = await Promise.all([
      this.messageRepo.find({ where: { businessId, platform }, order: { createdAt: 'DESC' }, take: THREAD_SCAN }),
      this.accountRepo.find({ where: { businessId, platform } }),
    ]);
    const names = new Map(accounts.map(a => [a.id, a.accountName]));
    const threads = new Map<string, InboxThread>();
    for (const m of messages) {
      const key = `${m.accountId}:${m.threadId}`;
      const t = threads.get(key);
      if (!t) {
        threads.set(key, {
          accountId: m.accountId,
          accountName: names.get(m.accountId) ?? '',
          threadId: m.threadId,
          customerName: m.customerName,
          lastText: m.text || (m.mediaUrl ? '📎 Attachment' : ''),
          lastDirection: m.direction,
          lastAt: m.createdAt,
        });
      } else if (!t.customerName && m.customerName) {
        t.customerName = m.customerName;
      }
    }
    return [...threads.values()];
  }

  async listMessages(businessId: string, accountId: string, threadId: string): Promise<SocialMessage[]> {
    const rows = await this.messageRepo.find({
      where: { businessId, accountId, threadId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.reverse();
  }

  async sendMessage(businessId: string, accountId: string, threadId: string, text: string): Promise<SocialMessage> {
    const account = await this.accountWithToken()
      .where('a.id = :accountId AND a.businessId = :businessId', { accountId, businessId })
      .getOne();
    if (!account) throw new NotFoundException('Account not found');
    const pageId = account.platform === 'facebook' ? account.accountId : account.pageId;
    if (!pageId) throw new BadRequestException('This Instagram account has no linked Facebook Page');

    const res = await this.metaGraph.sendMessage(pageId, threadId, text, account.accessToken);
    if (!res.success) throw new BadRequestException(res.error || 'Meta refused the message');

    // Meta's echo of this send can land first and already be stored under the same mid.
    const echoed = res.messageId ? await this.messageRepo.findOne({ where: { remoteMessageId: res.messageId } }) : null;
    if (echoed) return echoed;
    const last = await this.messageRepo.findOne({ where: { accountId, threadId }, order: { createdAt: 'DESC' } });
    return this.messageRepo.save(
      this.messageRepo.create({
        businessId,
        accountId,
        platform: account.platform,
        threadId,
        customerName: last?.customerName ?? null,
        direction: 'out',
        text,
        remoteMessageId: res.messageId ?? null,
        // Explicit ms timestamp: SQLite CURRENT_TIMESTAMP is whole seconds, which misorders quick replies.
        createdAt: new Date(),
      }),
    );
  }
}

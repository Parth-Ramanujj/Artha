import { Injectable } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { IntegrationService, readSmtpConfig } from '../../integrations/integration.service';
import { GoogleWorkspaceService } from '../../integrations/google/google-workspace.service';
import { IntegrationType } from '../../integrations/entities/integration.entity';
import type { SalesAgentConfig, SalesProspect } from '../entities/sales-agent.entity';
import { stripQuotedReply } from '../sales-rules';
import type { InboundReply, OutgoingMessage, SalesChannel } from './sales-channel';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAX_REPLIES_PER_POLL = 50;

/**
 * Email over an existing integration: a connected Google account (Gmail API) or an SMTP account.
 * Replies are read over IMAP with the SMTP login; a Google account can only send (its scope is gmail.send).
 * Lives in its own provider so the whole email side can be left out of the build.
 */
@Injectable()
export class EmailSalesChannel implements SalesChannel {
  readonly name = 'email' as const;

  constructor(
    private readonly integrations: IntegrationService,
    private readonly google: GoogleWorkspaceService,
  ) {}

  isReady(config: SalesAgentConfig): boolean {
    return !!config.email?.enabled && !!config.email.integrationId;
  }

  recipientFor(prospect: SalesProspect): string | null {
    const email = prospect.email.trim().toLowerCase();
    return EMAIL_RE.test(email) ? email : null;
  }

  dailyCap(config: SalesAgentConfig): number {
    return Math.max(0, config.email?.maxDailySends ?? 0);
  }

  footer(config: SalesAgentConfig): string {
    return [config.email?.optOutLine, config.email?.postalAddress]
      .map(s => s?.trim())
      .filter(Boolean)
      .join('\n');
  }

  async send(config: SalesAgentConfig, msg: OutgoingMessage): Promise<{ messageId: string }> {
    const integration = await this.integrations.findOne(config.email.integrationId, config.businessId);
    const email = { to: msg.to, subject: msg.subject, text: msg.body };
    if (integration.type === (IntegrationType.GOOGLE_GMAIL as string)) {
      const res = await this.google.gmailSend(integration, email);
      return { messageId: typeof res.id === 'string' ? res.id : '' };
    }
    const res = await this.integrations.sendEmail(integration.id, config.businessId, email);
    return { messageId: String(res.messageId ?? '') };
  }

  async pollReplies(
    config: SalesAgentConfig,
    since: Date,
    wanted: (from: string) => Promise<boolean>,
  ): Promise<InboundReply[]> {
    const integration = await this.integrations.findOne(config.email.integrationId, config.businessId);
    // shortcut: a Google account can't read mail with its send-only scope, so its replies aren't fetched
    // automatically; add gmail.readonly to the Google connection if that is ever needed.
    if (integration.type !== (IntegrationType.EMAIL_SMTP as string)) return [];
    const smtp = readSmtpConfig(integration.config);
    const host = config.email.imapHost?.trim() || smtp.host.replace(/^smtp\./i, 'imap.');
    const client = new ImapFlow({
      host,
      port: config.email.imapPort || 993,
      secure: (config.email.imapPort || 993) === 993,
      auth: { user: smtp.username, pass: smtp.password },
      logger: false,
    });
    const replies: InboundReply[] = [];
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        // Envelopes first, so only prospects' mail is downloaded; nothing is flagged as read.
        const uids: number[] = [];
        for await (const msg of client.fetch({ since }, { envelope: true, uid: true }, { uid: false })) {
          const from = msg.envelope?.from?.[0]?.address?.toLowerCase();
          if (from && (await wanted(from))) uids.push(msg.uid);
        }
        for (const uid of uids.slice(-MAX_REPLIES_PER_POLL)) {
          const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!full || !full.source) continue;
          const parsed = await simpleParser(full.source);
          const from = parsed.from?.value?.[0]?.address?.toLowerCase();
          if (!from) continue;
          replies.push({
            from,
            subject: parsed.subject ?? '',
            text: stripQuotedReply(parsed.text ?? ''),
            ref: parsed.messageId ?? `uid:${uid}`,
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return replies;
  }
}

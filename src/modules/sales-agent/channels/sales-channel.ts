import type { SalesAgentConfig, SalesChannelName, SalesProspect } from '../entities/sales-agent.entity';

/** Injection token for the list of channels this build includes (email can be left out entirely). */
export const SALES_CHANNELS = Symbol('SALES_CHANNELS');

export interface OutgoingMessage {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}

export interface InboundReply {
  /** Phone digits / chat id (WhatsApp) or sender address (email). */
  from: string;
  text: string;
  subject?: string;
  ref: string;
}

/**
 * One way of reaching prospects. Each channel is self-contained so it can be switched off per business
 * (config) or removed from the build (SALES_AGENT_EMAIL_ENABLED=false) without touching the rest.
 */
export interface SalesChannel {
  readonly name: SalesChannelName;
  /** Enabled in config and has what it needs to send. */
  isReady(config: SalesAgentConfig): boolean;
  /** Where this prospect is reached on this channel, or null when they can't be. */
  recipientFor(prospect: SalesProspect): string | null;
  dailyCap(config: SalesAgentConfig): number;
  /** Text appended to cold (sequence step 1) messages so recipients know how to opt out. */
  footer(config: SalesAgentConfig): string;
  send(config: SalesAgentConfig, msg: OutgoingMessage): Promise<{ messageId: string }>;
  /**
   * Pull-based channels (email) fetch replies received since `since` from senders `wanted` accepts, each
   * cycle; push-based ones (WhatsApp) leave this out. Must not change the mailbox (no marking as read).
   */
  pollReplies?(
    config: SalesAgentConfig,
    since: Date,
    wanted: (from: string) => Promise<boolean>,
  ): Promise<InboundReply[]>;
  /** Lets the rest of the app honour an opt-out (e.g. WhatsApp's DND tag that campaigns already skip). */
  onOptOut?(config: SalesAgentConfig, recipient: string): Promise<void>;
}

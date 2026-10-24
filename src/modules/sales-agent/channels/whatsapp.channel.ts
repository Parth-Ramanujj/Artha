import { Injectable, Logger } from '@nestjs/common';
import { MessageService } from '../../message/message.service';
import { ConversationService } from '../../conversation/conversation.service';
import { DND_TAG } from '../../conversation/dnd';
import type { SalesAgentConfig, SalesProspect } from '../entities/sales-agent.entity';
import { phoneToChatId, SALES_AGENT_TAG } from '../sales-rules';
import type { OutgoingMessage, SalesChannel } from './sales-channel';

@Injectable()
export class WhatsAppSalesChannel implements SalesChannel {
  readonly name = 'whatsapp' as const;
  private readonly logger = new Logger(WhatsAppSalesChannel.name);

  constructor(
    private readonly messages: MessageService,
    private readonly conversations: ConversationService,
  ) {}

  isReady(config: SalesAgentConfig): boolean {
    return !!config.whatsapp?.enabled && !!config.whatsapp.sessionId;
  }

  recipientFor(prospect: SalesProspect): string | null {
    return phoneToChatId(prospect.phone);
  }

  dailyCap(config: SalesAgentConfig): number {
    return Math.max(0, config.whatsapp?.maxDailySends ?? 0);
  }

  footer(config: SalesAgentConfig): string {
    return config.whatsapp?.optOutLine?.trim() ?? '';
  }

  async send(config: SalesAgentConfig, msg: OutgoingMessage): Promise<{ messageId: string }> {
    const sessionId = config.whatsapp.sessionId;
    const res = await this.messages.sendText(sessionId, { chatId: msg.to, text: msg.body });
    await this.tagChat(config, msg.to, SALES_AGENT_TAG);
    return { messageId: res.messageId };
  }

  async onOptOut(config: SalesAgentConfig, recipient: string): Promise<void> {
    await this.tagChat(config, recipient, DND_TAG);
  }

  private async tagChat(config: SalesAgentConfig, chatId: string, tag: string): Promise<void> {
    try {
      const conv = await this.conversations.getOrCreateConversation(
        config.businessId,
        config.whatsapp.sessionId,
        chatId,
      );
      if ((conv.tags ?? []).includes(tag)) return;
      await this.conversations.updateConversation(conv.id, config.businessId, { tags: [...(conv.tags ?? []), tag] });
    } catch (err) {
      this.logger.warn(`Could not tag ${chatId} with ${tag}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationType } from './entities/notification.entity';
import { AdvisorAlertConfig } from './entities/advisor-alert-config.entity';
import { NotificationService } from './notification.service';
import { EngineRegistry } from '../../engine/engine-registry.service';

export interface AlertConfig {
  sessionId: string;
  advisorChatId: string;
  advisorName?: string;
}

@Injectable()
export class AdvisorAlertService {
  private readonly logger = new Logger(AdvisorAlertService.name);

  constructor(
    @InjectRepository(AdvisorAlertConfig, 'data')
    private readonly configRepo: Repository<AdvisorAlertConfig>,
    private readonly notificationService: NotificationService,
    @Optional() private readonly engineRegistry?: EngineRegistry,
  ) {}

  async registerAdvisor(businessId: string, config: AlertConfig) {
    const exists = await this.configRepo.findOne({
      where: { businessId, sessionId: config.sessionId, advisorChatId: config.advisorChatId },
    });
    if (exists) return;
    await this.configRepo.save(
      this.configRepo.create({
        businessId,
        sessionId: config.sessionId,
        advisorChatId: config.advisorChatId,
        advisorName: config.advisorName ?? null,
      }),
    );
  }

  async unregisterAdvisor(businessId: string, advisorChatId: string) {
    await this.configRepo.delete({ businessId, advisorChatId });
  }

  async getAdvisors(businessId: string): Promise<AlertConfig[]> {
    const rows = await this.configRepo.find({ where: { businessId } });
    return rows.map(r => ({
      sessionId: r.sessionId,
      advisorChatId: r.advisorChatId,
      advisorName: r.advisorName ?? undefined,
    }));
  }

  async sendAlert(
    businessId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ) {
    await this.notificationService.notify(businessId, type, title, message, data);

    const advisors = await this.getAdvisors(businessId);
    for (const advisor of advisors) {
      try {
        const engine = this.engineRegistry?.get(advisor.sessionId);
        if (engine) {
          const alertText = `🚨 *${title}*\n\n${message}`;
          await engine.sendTextMessage(advisor.advisorChatId, alertText);
          this.logger.log(`Alert sent to advisor ${advisor.advisorName || advisor.advisorChatId}`);
        }
      } catch (error) {
        this.logger.error(`Failed to send alert to ${advisor.advisorChatId}: ${error}`);
      }
    }
  }

  async alertConversationAssigned(
    businessId: string,
    conversationId: string,
    customerName: string,
    assignedTo: string,
  ) {
    await this.sendAlert(
      businessId,
      NotificationType.CONVERSATION_ASSIGNED,
      'New Conversation Assigned',
      `Customer *${customerName}* has been assigned to agent *${assignedTo}*.\nConversation ID: ${conversationId}`,
      { conversationId, customerName, assignedTo },
    );
  }

  async alertSlaBreach(businessId: string, conversationId: string, policyName: string, minutesOverdue: number) {
    await this.sendAlert(
      businessId,
      NotificationType.SLA_BREACH,
      'SLA Breach Alert',
      `⚠️ SLA policy *${policyName}* breached!\nConversation: ${conversationId}\nOverdue by: ${minutesOverdue} minutes`,
      { conversationId, policyName, minutesOverdue },
    );
  }

  async alertNewUnreadMessage(businessId: string, chatName: string, messagePreview: string) {
    await this.sendAlert(
      businessId,
      NotificationType.CONVERSATION_UNREAD,
      'New Unread Message',
      `📩 New message from *${chatName}*:\n"${messagePreview}"`,
      { chatName, messagePreview },
    );
  }
}

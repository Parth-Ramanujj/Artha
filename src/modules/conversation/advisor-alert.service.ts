import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationType } from './entities/notification.entity';
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
  private readonly alertConfigs = new Map<string, AlertConfig[]>();

  constructor(
    private readonly notificationService: NotificationService,
    @Optional() private readonly engineRegistry?: EngineRegistry,
  ) {}

  registerAdvisor(businessId: string, config: AlertConfig) {
    const configs = this.alertConfigs.get(businessId) || [];
    const exists = configs.find(c => c.advisorChatId === config.advisorChatId && c.sessionId === config.sessionId);
    if (!exists) {
      configs.push(config);
      this.alertConfigs.set(businessId, configs);
    }
  }

  unregisterAdvisor(businessId: string, advisorChatId: string) {
    const configs = (this.alertConfigs.get(businessId) || []).filter(c => c.advisorChatId !== advisorChatId);
    this.alertConfigs.set(businessId, configs);
  }

  getAdvisors(businessId: string): AlertConfig[] {
    return this.alertConfigs.get(businessId) || [];
  }

  async sendAlert(
    businessId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ) {
    await this.notificationService.notify(businessId, type, title, message, data);

    const advisors = this.alertConfigs.get(businessId) || [];
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

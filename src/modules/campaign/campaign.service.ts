import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { ScheduledMessage, ScheduledMessageStatus } from './entities/scheduled-message.entity';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { CampaignRecipient, RecipientStatus } from './entities/campaign-recipient.entity';
import { ContactConsent, ConsentStatus } from './entities/contact-consent.entity';
import { Template } from '../template/entities/template.entity';
import { EngineRegistry } from '../../engine/engine-registry.service';
import {
  CreateScheduledMessageDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  AddCampaignRecipientsDto,
  UpdateConsentDto,
  ScheduleCampaignDto,
} from './dto/campaign.dto';
import { createLogger } from '../../common/services/logger.service';
import { BusinessService } from '../business/business.service';

const MAX_RECIPIENTS_PER_CAMPAIGN = 10_000;
const MAX_SCHEDULED_PER_BUSINESS = 1_000;

@Injectable()
export class CampaignService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('CampaignService');
  private schedulerTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(ScheduledMessage, 'data')
    private readonly scheduledRepo: Repository<ScheduledMessage>,
    @InjectRepository(Campaign, 'data')
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignRecipient, 'data')
    private readonly recipientRepo: Repository<CampaignRecipient>,
    @InjectRepository(ContactConsent, 'data')
    private readonly consentRepo: Repository<ContactConsent>,
    @InjectRepository(Template, 'data')
    private readonly templateRepo: Repository<Template>,
    private readonly businessService: BusinessService,
    private readonly engines: EngineRegistry,
  ) {}

  onModuleInit(): void {
    this.schedulerTimer = setInterval(() => {
      void this.checkScheduledJobs().catch(err =>
        this.logger.error('Error during scheduled jobs check', err instanceof Error ? err.message : String(err)),
      );
    }, 20_000);
  }

  onModuleDestroy(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
    }
  }

  private async checkScheduledJobs(): Promise<void> {
    const now = new Date();

    // 1. Process due scheduled messages
    const dueMessages = await this.scheduledRepo.find({
      where: {
        status: ScheduledMessageStatus.PENDING,
        scheduledAt: LessThanOrEqual(now),
      },
      take: 20,
    });

    for (const msg of dueMessages) {
      try {
        const engine = this.engines.get(msg.sessionId);
        if (!engine) {
          this.logger.warn(`Session ${msg.sessionId} not loaded for scheduled message ${msg.id}`);
          continue;
        }

        await engine.sendTextMessage(msg.chatId, msg.content);
        msg.status = ScheduledMessageStatus.SENT;
        msg.sentAt = new Date();
        msg.errorMessage = null;
        await this.scheduledRepo.save(msg);
        this.logger.log(`Delivered scheduled message ${msg.id} to ${msg.chatId}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        msg.status = ScheduledMessageStatus.FAILED;
        msg.errorMessage = errorMsg;
        await this.scheduledRepo.save(msg);
        this.logger.warn(`Failed scheduled message ${msg.id}: ${errorMsg}`);
      }
    }

    // 2. Process due scheduled campaigns
    const dueCampaigns = await this.campaignRepo.find({
      where: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(now),
      },
      take: 5,
    });

    for (const camp of dueCampaigns) {
      this.logger.log(`Auto-starting scheduled campaign: ${camp.name} (${camp.id})`);
      try {
        await this.startCampaign(camp.id, camp.businessId);
      } catch (err) {
        this.logger.warn(
          `Failed to auto-start scheduled campaign ${camp.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // ── Scheduled Messages ──

  async createScheduledMessage(
    businessId: string | null,
    dto: CreateScheduledMessageDto,
    apiKeyId?: string,
  ): Promise<ScheduledMessage> {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;

    const count = await this.scheduledRepo.count({
      where: { businessId: targetBusinessId, status: ScheduledMessageStatus.PENDING },
    });
    if (count >= MAX_SCHEDULED_PER_BUSINESS) {
      throw new BadRequestException(
        `Maximum of ${String(MAX_SCHEDULED_PER_BUSINESS)} pending scheduled messages per business`,
      );
    }

    const msg = this.scheduledRepo.create({
      businessId: targetBusinessId,
      sessionId: dto.sessionId,
      chatId: dto.chatId,
      content: dto.content,
      messageOptions: dto.messageOptions ?? null,
      scheduledAt,
      status: ScheduledMessageStatus.PENDING,
      createdBy: apiKeyId ?? null,
    });
    return this.scheduledRepo.save(msg);
  }

  async findScheduledMessages(
    businessId: string | null,
    opts: { status?: ScheduledMessageStatus; limit?: number; offset?: number } = {},
  ): Promise<ScheduledMessage[]> {
    const qb = this.scheduledRepo.createQueryBuilder('m');
    if (businessId) qb.where('m.businessId = :businessId', { businessId });
    qb.orderBy('m.scheduledAt', 'ASC').take(opts.limit ?? 50);
    if (opts.status) qb.andWhere('m.status = :status', { status: opts.status });
    if (opts.offset) qb.skip(opts.offset);
    return qb.getMany();
  }

  async cancelScheduledMessage(id: string, businessId: string | null): Promise<ScheduledMessage> {
    const msg = await this.scheduledRepo.findOne({ where: { id } });
    if (!msg) throw new NotFoundException('Scheduled message not found');
    if (businessId && msg.businessId !== businessId) throw new ForbiddenException('Not authorized');
    if (msg.status !== ScheduledMessageStatus.PENDING) {
      throw new BadRequestException('Only pending messages can be cancelled');
    }
    msg.status = ScheduledMessageStatus.CANCELLED;
    return this.scheduledRepo.save(msg);
  }

  async getDueMessages(batchSize: number = 50): Promise<ScheduledMessage[]> {
    return this.scheduledRepo.find({
      where: {
        status: ScheduledMessageStatus.PENDING,
        scheduledAt: LessThanOrEqual(new Date()),
      },
      order: { scheduledAt: 'ASC' },
      take: batchSize,
    });
  }

  async markMessageSent(id: string): Promise<void> {
    await this.scheduledRepo.update(id, {
      status: ScheduledMessageStatus.SENT,
      sentAt: new Date(),
    });
  }

  async markMessageFailed(id: string, error: string): Promise<void> {
    const msg = await this.scheduledRepo.findOne({ where: { id } });
    if (!msg) return;
    msg.status = ScheduledMessageStatus.FAILED;
    msg.errorMessage = error;
    msg.retryCount += 1;
    await this.scheduledRepo.save(msg);
  }

  // ── Campaigns ──

  async createCampaign(businessId: string | null, dto: CreateCampaignDto, apiKeyId?: string): Promise<Campaign> {
    if (!dto.templateId && !dto.messageContent) {
      throw new BadRequestException('Either templateId or messageContent is required');
    }

    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;

    const campaign = this.campaignRepo.create({
      businessId: targetBusinessId,
      name: dto.name,
      description: dto.description ?? null,
      sessionId: dto.sessionId,
      templateId: dto.templateId ?? null,
      messageContent: dto.messageContent ?? null,
      messageOptions: dto.messageOptions ?? null,
      ratePerMinute: dto.ratePerMinute ?? 10,
      targetFilters: dto.targetFilters ?? null,
      status: CampaignStatus.DRAFT,
      createdBy: apiKeyId ?? null,
    });
    return this.campaignRepo.save(campaign);
  }

  async findCampaigns(
    businessId: string | null,
    opts: { status?: CampaignStatus; limit?: number; offset?: number } = {},
  ): Promise<Campaign[]> {
    const qb = this.campaignRepo.createQueryBuilder('c');
    if (businessId) qb.where('c.businessId = :businessId', { businessId });
    qb.orderBy('c.createdAt', 'DESC').take(opts.limit ?? 50);
    if (opts.status) qb.andWhere('c.status = :status', { status: opts.status });
    if (opts.offset) qb.skip(opts.offset);
    return qb.getMany();
  }

  async findOneCampaign(id: string, businessId: string | null): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (businessId && campaign.businessId !== businessId) throw new ForbiddenException('Not authorized');
    return campaign;
  }

  async updateCampaign(id: string, businessId: string | null, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOneCampaign(id, businessId);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be updated');
    }

    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.description !== undefined) campaign.description = dto.description ?? null;
    if (dto.templateId !== undefined) campaign.templateId = dto.templateId ?? null;
    if (dto.messageContent !== undefined) campaign.messageContent = dto.messageContent ?? null;
    if (dto.messageOptions !== undefined) campaign.messageOptions = dto.messageOptions ?? null;
    if (dto.ratePerMinute !== undefined) campaign.ratePerMinute = dto.ratePerMinute;
    if (dto.targetFilters !== undefined) campaign.targetFilters = dto.targetFilters ?? null;

    return this.campaignRepo.save(campaign);
  }

  async scheduleCampaign(id: string, businessId: string | null, dto: ScheduleCampaignDto): Promise<Campaign> {
    const campaign = await this.findOneCampaign(id, businessId);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be scheduled');
    }

    const recipientCount = await this.recipientRepo.count({ where: { campaignId: id } });
    if (recipientCount === 0) {
      throw new BadRequestException('Campaign has no recipients');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    campaign.status = CampaignStatus.SCHEDULED;
    campaign.scheduledAt = scheduledAt;
    campaign.totalRecipients = recipientCount;
    return this.campaignRepo.save(campaign);
  }

  async pauseCampaign(id: string, businessId: string | null): Promise<Campaign> {
    const campaign = await this.findOneCampaign(id, businessId);
    if (campaign.status !== CampaignStatus.RUNNING) {
      throw new BadRequestException('Only running campaigns can be paused');
    }
    campaign.status = CampaignStatus.PAUSED;
    return this.campaignRepo.save(campaign);
  }

  async cancelCampaign(id: string, businessId: string | null): Promise<Campaign> {
    const campaign = await this.findOneCampaign(id, businessId);
    if (
      !([CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.PAUSED] as string[]).includes(campaign.status)
    ) {
      throw new BadRequestException('Campaign cannot be cancelled in its current state');
    }
    campaign.status = CampaignStatus.CANCELLED;
    return this.campaignRepo.save(campaign);
  }

  async deleteCampaign(id: string, businessId: string | null): Promise<void> {
    const campaign = await this.findOneCampaign(id, businessId);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be deleted');
    }
    await this.recipientRepo.delete({ campaignId: id });
    await this.campaignRepo.remove(campaign);
  }

  normalizeChatId(input: string): string {
    const trimmed = input.trim();
    if (trimmed.endsWith('@c.us') || trimmed.endsWith('@g.us') || trimmed.endsWith('@newsletter')) {
      return trimmed;
    }
    const digits = trimmed.replace(/[^\d]/g, '');
    if (!digits) return '';
    return `${digits}@c.us`;
  }

  // ── Campaign Execution ──

  async startCampaign(id: string, businessId: string | null): Promise<Campaign> {
    const campaign = await this.findOneCampaign(id, businessId);
    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException('Campaign is already completed');
    }
    if (campaign.status === CampaignStatus.CANCELLED) {
      throw new BadRequestException('Campaign has been cancelled');
    }

    const totalRecipients = await this.recipientRepo.count({ where: { campaignId: id } });
    if (totalRecipients === 0) {
      throw new BadRequestException('Campaign has no recipients. Please add recipients first.');
    }

    const pendingCount = await this.recipientRepo.count({
      where: { campaignId: id, status: RecipientStatus.PENDING },
    });
    if (pendingCount === 0) {
      throw new BadRequestException('All recipients in this campaign have already been processed.');
    }

    const engine = this.engines.get(campaign.sessionId);
    if (!engine) {
      throw new BadRequestException(
        `WhatsApp session "${campaign.sessionId}" is not active or ready. Please start the session first.`,
      );
    }

    campaign.status = CampaignStatus.RUNNING;
    campaign.totalRecipients = totalRecipients;
    campaign.startedAt = campaign.startedAt || new Date();
    const saved = await this.campaignRepo.save(campaign);

    // Launch asynchronous delivery worker
    void this.processCampaignDelivery(id);

    return saved;
  }

  private async processCampaignDelivery(campaignId: string): Promise<void> {
    this.logger.log(`Starting delivery worker for campaign ${campaignId}`);

    try {
      const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
      if (!campaign || campaign.status !== CampaignStatus.RUNNING) return;

      const engine = this.engines.get(campaign.sessionId);
      if (!engine) {
        this.logger.warn(`No active engine for session ${campaign.sessionId}. Pausing campaign ${campaignId}.`);
        campaign.status = CampaignStatus.PAUSED;
        await this.campaignRepo.save(campaign);
        return;
      }

      // Determine template / text content
      let baseText = campaign.messageContent || '';
      if (campaign.templateId) {
        const tpl = await this.templateRepo.findOne({ where: { id: campaign.templateId } });
        if (tpl) {
          const parts: string[] = [];
          if (tpl.header) parts.push(tpl.header);
          if (tpl.body) parts.push(tpl.body);
          if (tpl.footer) parts.push(tpl.footer);
          baseText = parts.join('\n\n');
        }
      }

      const pendingRecipients = await this.recipientRepo.find({
        where: { campaignId, status: RecipientStatus.PENDING },
        order: { createdAt: 'ASC' },
      });

      const rate = campaign.ratePerMinute || 10;
      const delayMs = Math.max(1000, Math.floor(60_000 / rate));

      for (const recipient of pendingRecipients) {
        // Re-check campaign state to support pausing / cancelling mid-run
        const check = await this.campaignRepo.findOne({
          where: { id: campaignId },
          select: { id: true, status: true },
        });

        if (!check || check.status !== CampaignStatus.RUNNING) {
          this.logger.log(`Campaign ${campaignId} was paused or cancelled during delivery.`);
          return;
        }

        try {
          let text = baseText;
          if (recipient.contactName) {
            text = text.replace(/\{\{\s*name\s*\}\}/gi, recipient.contactName);
          }

          await engine.sendTextMessage(recipient.chatId, text);

          recipient.status = RecipientStatus.SENT;
          recipient.sentAt = new Date();
          recipient.errorMessage = null;
          await this.recipientRepo.save(recipient);

          await this.campaignRepo.increment({ id: campaignId }, 'sentCount', 1);
          this.logger.log(`Campaign ${campaignId} message sent to ${recipient.chatId}`);
        } catch (sendErr) {
          const errText = sendErr instanceof Error ? sendErr.message : String(sendErr);
          this.logger.warn(`Campaign ${campaignId} failed sending to ${recipient.chatId}: ${errText}`);

          recipient.status = RecipientStatus.FAILED;
          recipient.errorMessage = errText;
          await this.recipientRepo.save(recipient);

          await this.campaignRepo.increment({ id: campaignId }, 'failedCount', 1);
        }

        // Delay between sends according to ratePerMinute
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Check remaining pending
      const remaining = await this.recipientRepo.count({
        where: { campaignId, status: RecipientStatus.PENDING },
      });

      if (remaining === 0) {
        const finalCampaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
        if (finalCampaign && finalCampaign.status === CampaignStatus.RUNNING) {
          finalCampaign.status = CampaignStatus.COMPLETED;
          finalCampaign.completedAt = new Date();
          await this.campaignRepo.save(finalCampaign);
          this.logger.log(`Campaign ${campaignId} completed!`);
        }
      }
    } catch (err) {
      this.logger.error(
        `Error in processCampaignDelivery: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Campaign Recipients ──

  async addRecipients(
    campaignId: string,
    businessId: string | null,
    dto: AddCampaignRecipientsDto,
  ): Promise<{ added: number }> {
    const campaign = await this.findOneCampaign(campaignId, businessId);
    if (![CampaignStatus.DRAFT, CampaignStatus.PAUSED, CampaignStatus.SCHEDULED].includes(campaign.status)) {
      throw new BadRequestException('Recipients can only be added to draft, scheduled, or paused campaigns');
    }

    const existingCount = await this.recipientRepo.count({ where: { campaignId } });
    if (existingCount + dto.chatIds.length > MAX_RECIPIENTS_PER_CAMPAIGN) {
      throw new BadRequestException(`Maximum of ${String(MAX_RECIPIENTS_PER_CAMPAIGN)} recipients per campaign`);
    }

    const existing = await this.recipientRepo.find({
      where: { campaignId },
      select: { chatId: true },
    });
    const existingSet = new Set(existing.map(r => r.chatId));

    const newRecipients = dto.chatIds
      .map(id => this.normalizeChatId(id))
      .filter(chatId => !!chatId && !existingSet.has(chatId))
      .map(chatId =>
        this.recipientRepo.create({
          campaignId,
          chatId,
          status: RecipientStatus.PENDING,
        }),
      );

    if (newRecipients.length > 0) {
      await this.recipientRepo.save(newRecipients);
      campaign.totalRecipients = existingCount + newRecipients.length;
      await this.campaignRepo.save(campaign);
    }

    return { added: newRecipients.length };
  }

  async findRecipients(
    campaignId: string,
    businessId: string | null,
    opts: { status?: RecipientStatus; limit?: number; offset?: number } = {},
  ): Promise<CampaignRecipient[]> {
    await this.findOneCampaign(campaignId, businessId);
    const qb = this.recipientRepo
      .createQueryBuilder('r')
      .where('r.campaignId = :campaignId', { campaignId })
      .orderBy('r.createdAt', 'ASC')
      .take(opts.limit ?? 100);
    if (opts.status) qb.andWhere('r.status = :status', { status: opts.status });
    if (opts.offset) qb.skip(opts.offset);
    return qb.getMany();
  }

  async removeRecipients(campaignId: string, businessId: string | null, chatIds: string[]): Promise<void> {
    const campaign = await this.findOneCampaign(campaignId, businessId);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Recipients can only be removed from draft campaigns');
    }
    await this.recipientRepo.delete({ campaignId, chatId: In(chatIds) });
  }

  // ── Consent ──

  async getConsent(
    businessId: string | null,
    waContactId: string,
    channel: string = 'whatsapp',
  ): Promise<ContactConsent | null> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    return this.consentRepo.findOne({ where: { businessId: targetBusinessId, waContactId, channel } });
  }

  async findConsents(
    businessId: string | null,
    opts: { status?: ConsentStatus; limit?: number; offset?: number } = {},
  ): Promise<ContactConsent[]> {
    const qb = this.consentRepo.createQueryBuilder('c');
    if (businessId) qb.where('c.businessId = :businessId', { businessId });
    qb.orderBy('c.updatedAt', 'DESC').take(opts.limit ?? 50);
    if (opts.status) qb.andWhere('c.status = :status', { status: opts.status });
    if (opts.offset) qb.skip(opts.offset);
    return qb.getMany();
  }

  async updateConsent(
    businessId: string | null,
    waContactId: string,
    dto: UpdateConsentDto,
    channel: string = 'whatsapp',
  ): Promise<ContactConsent> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    let consent = await this.consentRepo.findOne({ where: { businessId: targetBusinessId, waContactId, channel } });

    if (!consent) {
      consent = this.consentRepo.create({
        businessId: targetBusinessId,
        waContactId,
        channel,
      });
    }

    consent.status = dto.status;
    consent.source = dto.source ?? null;

    if (dto.status === ConsentStatus.OPTED_IN) {
      consent.consentedAt = new Date();
      consent.revokedAt = null;
    } else if (dto.status === ConsentStatus.OPTED_OUT) {
      consent.revokedAt = new Date();
    }

    return this.consentRepo.save(consent);
  }

  async checkConsent(businessId: string, waContactId: string, channel: string = 'whatsapp'): Promise<boolean> {
    const consent = await this.getConsent(businessId, waContactId, channel);
    return consent?.status === ConsentStatus.OPTED_IN;
  }

  async filterConsentedRecipients(businessId: string, chatIds: string[]): Promise<string[]> {
    if (chatIds.length === 0) return [];

    const consents = await this.consentRepo.find({
      where: {
        businessId,
        waContactId: In(chatIds),
        status: ConsentStatus.OPTED_IN,
      },
      select: { waContactId: true },
    });

    const consentedSet = new Set(consents.map(c => c.waContactId));
    return chatIds.filter(id => consentedSet.has(id));
  }
}

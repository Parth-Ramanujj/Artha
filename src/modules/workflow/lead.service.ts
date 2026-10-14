import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Lead, LeadStatus } from './entities/lead.entity';
import { Agent } from './entities/agent.entity';

export interface CreateLeadDto {
  businessId: string;
  sessionId?: string;
  chatId: string;
  customerPhone: string;
  customerName?: string;
  mainService: string;
  selectedService: string;
  productCategory?: string;
  subProduct?: string;
  claimIssueType?: string;
  insuranceCompany?: string;
  issueDescription?: string;
  pincode: string;
  city?: string;
  state?: string;
  matchedAgent?: Agent;
  workflowId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LeadService {
  private readonly logger = new Logger(LeadService.name);

  constructor(
    @InjectRepository(Lead, 'data')
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Agent, 'data')
    private readonly agentRepo: Repository<Agent>,
  ) {}

  async createOrUpdateLead(dto: CreateLeadDto): Promise<Lead> {
    const cleanPhone = dto.customerPhone.replace(/[^0-9]/g, '');

    // 1. Idempotency check: If a lead for this phone & service was created in the last 10 minutes, update it rather than duplicating
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const existing = await this.leadRepo.findOne({
      where: {
        businessId: dto.businessId,
        customerPhone: cleanPhone,
        createdAt: MoreThan(tenMinutesAgo),
      },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      existing.mainService = dto.mainService || existing.mainService;
      existing.selectedService = dto.selectedService || existing.selectedService;
      existing.productCategory = dto.productCategory || existing.productCategory;
      existing.subProduct = dto.subProduct || existing.subProduct;
      existing.claimIssueType = dto.claimIssueType || existing.claimIssueType;
      existing.insuranceCompany = dto.insuranceCompany || existing.insuranceCompany;
      existing.issueDescription = dto.issueDescription || existing.issueDescription;
      existing.pincode = dto.pincode || existing.pincode;

      if (dto.matchedAgent) {
        existing.matchedAgentId = dto.matchedAgent.id;
        existing.matchedAgentName = dto.matchedAgent.name;
        existing.matchedAgentPhone = dto.matchedAgent.phone;
        existing.status = LeadStatus.ASSIGNED;
      }

      existing.metadata = { ...(existing.metadata || {}), ...(dto.metadata || {}) };
      const saved = await this.leadRepo.save(existing);
      this.logger.log(`Updated existing lead ${saved.leadNumber} for ${cleanPhone}`);
      return saved;
    }

    // 2. Generate unique lead number (e.g. LEAD-INS-84920)
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const prefix = dto.mainService === 'mutual_fund' ? 'MF' : 'INS';
    const leadNumber = `LD-${prefix}-${randomSuffix}`;

    const newLead = this.leadRepo.create({
      leadNumber,
      businessId: dto.businessId,
      sessionId: dto.sessionId || null,
      chatId: dto.chatId,
      customerPhone: cleanPhone,
      customerName: dto.customerName || null,
      mainService: dto.mainService,
      selectedService: dto.selectedService,
      productCategory: dto.productCategory || null,
      subProduct: dto.subProduct || null,
      claimIssueType: dto.claimIssueType || null,
      insuranceCompany: dto.insuranceCompany || null,
      issueDescription: dto.issueDescription || null,
      pincode: dto.pincode,
      city: dto.city || null,
      state: dto.state || null,
      matchedAgentId: dto.matchedAgent?.id || null,
      matchedAgentName: dto.matchedAgent?.name || null,
      matchedAgentPhone: dto.matchedAgent?.phone || null,
      status: dto.matchedAgent ? LeadStatus.ASSIGNED : LeadStatus.QUALIFIED,
      workflowId: dto.workflowId || null,
      conversationId: dto.conversationId || null,
      metadata: dto.metadata || null,
    });

    const saved = await this.leadRepo.save(newLead);
    this.logger.log(`Created qualified lead ${saved.leadNumber} for phone ${cleanPhone}`);

    // 3. Update agent lead capacity counter if assigned
    if (dto.matchedAgent?.id) {
      await this.agentRepo.increment({ id: dto.matchedAgent.id }, 'currentLeadsCount', 1).catch(() => {});
    }

    return saved;
  }

  async listLeads(businessId?: string, status?: LeadStatus): Promise<Lead[]> {
    const where: Record<string, unknown> = {};
    if (businessId) where['businessId'] = businessId;
    if (status) where['status'] = status;

    return this.leadRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getLeadById(id: string): Promise<Lead | null> {
    return this.leadRepo.findOne({ where: { id } });
  }

  async updateLeadStatus(id: string, status: LeadStatus): Promise<Lead> {
    const lead = await this.leadRepo.findOneOrFail({ where: { id } });
    lead.status = status;
    if (status === LeadStatus.CONTACTED) {
      lead.contactedAt = new Date();
    }
    return this.leadRepo.save(lead);
  }
}

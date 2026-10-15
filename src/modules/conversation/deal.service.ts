import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deal, DealStage } from './entities/deal.entity';
import { Contact } from './entities/contact.entity';
import { Conversation } from './entities/conversation.entity';
import { CreateDealDto, UpdateDealDto } from './dto/deal.dto';
import { createLogger } from '../../common/services/logger.service';

interface DealLinkInput {
  contactId?: string | null;
  conversationId?: string | null;
}

@Injectable()
export class DealService {
  private readonly logger = createLogger('DealService');

  constructor(
    @InjectRepository(Deal, 'data')
    private readonly dealRepo: Repository<Deal>,
    @InjectRepository(Contact, 'data')
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Conversation, 'data')
    private readonly conversationRepo: Repository<Conversation>,
  ) {}

  async findAll(
    businessId: string,
    filter?: { stage?: string; priority?: string; search?: string; contactId?: string },
  ): Promise<Deal[]> {
    const qb = this.dealRepo
      .createQueryBuilder('deal')
      .where('deal.businessId = :businessId', { businessId })
      .orderBy('deal.updatedAt', 'DESC');

    if (filter?.stage) {
      qb.andWhere('deal.stage = :stage', { stage: filter.stage });
    }
    if (filter?.contactId) {
      qb.andWhere('deal.contactId = :contactId', { contactId: filter.contactId });
    }
    if (filter?.priority) {
      qb.andWhere('deal.priority = :priority', { priority: filter.priority });
    }
    if (filter?.search) {
      qb.andWhere(
        '(LOWER(deal.title) LIKE LOWER(:search) OR LOWER(deal.contactName) LIKE LOWER(:search) OR deal.contactPhone LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string, businessId: string): Promise<Deal> {
    const deal = await this.dealRepo.findOne({
      where: { id, businessId },
    });
    if (!deal) {
      throw new NotFoundException(`Deal with ID "${id}" not found`);
    }
    return deal;
  }

  async create(businessId: string, dto: CreateDealDto): Promise<Deal> {
    const contact = await this.resolveLinks(businessId, dto);
    const contactName = dto.contactName ?? contact?.name ?? null;
    const contactPhone = dto.contactPhone ?? contact?.phone ?? null;
    if (!contactName || !contactPhone) {
      throw new BadRequestException('contactName and contactPhone are required unless a contact is linked');
    }

    const deal = this.dealRepo.create({
      ...dto,
      contactName,
      contactPhone,
      contactId: dto.contactId ?? null,
      conversationId: dto.conversationId ?? null,
      businessId,
      amount: dto.amount ?? 0,
      stage: dto.stage ?? DealStage.LEAD,
      assignedTo: dto.assignedTo ?? 'Unassigned',
    });
    const saved = await this.dealRepo.save(deal);
    this.logger.log(`Created new deal "${saved.title}" for business=${businessId}`, { dealId: saved.id });
    return saved;
  }

  async update(id: string, businessId: string, dto: UpdateDealDto): Promise<Deal> {
    const deal = await this.findOne(id, businessId);
    await this.resolveLinks(businessId, dto);
    Object.assign(deal, dto);
    const updated = await this.dealRepo.save(deal);
    this.logger.log(`Updated deal "${updated.title}" for business=${businessId}`, {
      dealId: updated.id,
      stage: updated.stage,
    });
    return updated;
  }

  async remove(id: string, businessId: string): Promise<void> {
    const deal = await this.findOne(id, businessId);
    await this.dealRepo.remove(deal);
    this.logger.log(`Removed deal "${id}" for business=${businessId}`);
  }

  private async resolveLinks(businessId: string, link: DealLinkInput): Promise<Contact | null> {
    const scope = businessId ? { businessId } : {};
    let contact: Contact | null = null;
    if (link.contactId) {
      contact = await this.contactRepo.findOne({ where: { id: link.contactId, ...scope } });
      if (!contact) throw new BadRequestException(`Linked contact "${link.contactId}" not found`);
    }
    if (link.conversationId) {
      const conversation = await this.conversationRepo.findOne({ where: { id: link.conversationId, ...scope } });
      if (!conversation) throw new BadRequestException(`Linked conversation "${link.conversationId}" not found`);
    }
    return contact;
  }

  async getMetrics(businessId: string): Promise<{
    totalValue: number;
    activeCount: number;
    wonCount: number;
    lostCount: number;
    winRate: number;
    byStage: Record<string, { count: number; totalAmount: number }>;
  }> {
    const deals = await this.dealRepo.find({ where: { businessId } });
    let totalValue = 0;
    let wonCount = 0;
    let lostCount = 0;
    let activeCount = 0;
    const byStage: Record<string, { count: number; totalAmount: number }> = {};

    for (const d of deals) {
      totalValue += d.amount || 0;
      if (d.stage === DealStage.WON) wonCount++;
      else if (d.stage === DealStage.LOST) lostCount++;
      else activeCount++;

      if (!byStage[d.stage]) {
        byStage[d.stage] = { count: 0, totalAmount: 0 };
      }
      byStage[d.stage].count++;
      byStage[d.stage].totalAmount += d.amount || 0;
    }

    const closed = wonCount + lostCount;
    const winRate = closed > 0 ? Math.round((wonCount / closed) * 100) : 0;

    return {
      totalValue,
      activeCount,
      wonCount,
      lostCount,
      winRate,
      byStage,
    };
  }
}

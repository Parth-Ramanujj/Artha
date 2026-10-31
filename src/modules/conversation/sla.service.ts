import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlaPolicy } from './entities/sla-policy.entity';
import { SlaEvent, SlaEventType } from './entities/sla-event.entity';
import { CreateSlaPolicyDto, UpdateSlaPolicyDto } from './dto/sla-policy.dto';

@Injectable()
export class SlaService {
  constructor(
    @InjectRepository(SlaPolicy, 'data') private readonly policyRepo: Repository<SlaPolicy>,
    @InjectRepository(SlaEvent, 'data') private readonly eventRepo: Repository<SlaEvent>,
  ) {}

  async findAllPolicies(businessId: string) {
    return this.policyRepo.find({
      where: { businessId },
      order: { priority: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOnePolicy(id: string, businessId: string) {
    const policy = await this.policyRepo.findOne({ where: { id, businessId } });
    if (!policy) throw new NotFoundException('SLA policy not found');
    return policy;
  }

  async createPolicy(businessId: string, dto: CreateSlaPolicyDto) {
    const policy = this.policyRepo.create({ ...dto, businessId });
    return this.policyRepo.save(policy);
  }

  async updatePolicy(id: string, businessId: string, dto: UpdateSlaPolicyDto) {
    const policy = await this.findOnePolicy(id, businessId);
    Object.assign(policy, dto);
    return this.policyRepo.save(policy);
  }

  async removePolicy(id: string, businessId: string) {
    const policy = await this.findOnePolicy(id, businessId);
    await this.policyRepo.remove(policy);
  }

  async getEvents(
    businessId: string,
    opts?: { conversationId?: string; type?: string; limit?: number; offset?: number },
  ) {
    const qb = this.eventRepo
      .createQueryBuilder('e')
      .where('e.businessId = :businessId', { businessId })
      .orderBy('e.createdAt', 'DESC');

    if (opts?.conversationId) qb.andWhere('e.conversationId = :cid', { cid: opts.conversationId });
    if (opts?.type) qb.andWhere('e.type = :type', { type: opts.type });
    if (opts?.limit) qb.take(opts.limit);
    if (opts?.offset) qb.skip(opts.offset);

    return qb.getMany();
  }

  async getBreachStats(businessId: string) {
    const events = await this.eventRepo.find({ where: { businessId } });
    const total = events.length;
    // SlaEvent.type is a plain varchar column, so compare against the enum's string values.
    const breachTypes = new Set<string>([SlaEventType.FIRST_RESPONSE_BREACHED, SlaEventType.RESOLUTION_BREACHED]);
    const metTypes = new Set<string>([SlaEventType.FIRST_RESPONSE_MET, SlaEventType.RESOLUTION_MET]);
    const breaches = events.filter(e => breachTypes.has(e.type)).length;
    const met = events.filter(e => metTypes.has(e.type)).length;

    return {
      total,
      breaches,
      met,
      complianceRate: total > 0 ? Math.round((met / total) * 100) : 100,
    };
  }

  async recordEvent(
    businessId: string,
    conversationId: string,
    type: SlaEventType,
    opts?: { policyId?: string; targetMinutes?: number; actualMinutes?: number; deadlineAt?: Date; resolvedAt?: Date },
  ) {
    const event = this.eventRepo.create({
      businessId,
      conversationId,
      type,
      policyId: opts?.policyId ?? null,
      targetMinutes: opts?.targetMinutes ?? null,
      actualMinutes: opts?.actualMinutes ?? null,
      deadlineAt: opts?.deadlineAt ?? null,
      resolvedAt: opts?.resolvedAt ?? null,
    });
    return this.eventRepo.save(event);
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentRule, AssignmentStrategy } from './entities/assignment-rule.entity';
import { CreateAssignmentRuleDto, UpdateAssignmentRuleDto } from './dto/assignment-rule.dto';
import { createLogger } from '../../common/services/logger.service';

@Injectable()
export class AssignmentRuleService {
  private readonly logger = createLogger('AssignmentRuleService');

  constructor(
    @InjectRepository(AssignmentRule, 'data')
    private readonly repo: Repository<AssignmentRule>,
  ) {}

  async findAll(businessId: string): Promise<AssignmentRule[]> {
    return this.repo.find({ where: { businessId }, order: { priority: 'DESC', createdAt: 'ASC' } });
  }

  async findOne(id: string, businessId: string): Promise<AssignmentRule> {
    const rule = await this.repo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Assignment rule not found');
    if (rule.businessId !== businessId) throw new ForbiddenException('Not authorized');
    return rule;
  }

  async create(businessId: string, dto: CreateAssignmentRuleDto): Promise<AssignmentRule> {
    const rule = this.repo.create({ businessId, ...dto });
    return this.repo.save(rule);
  }

  async update(id: string, businessId: string, dto: UpdateAssignmentRuleDto): Promise<AssignmentRule> {
    const rule = await this.findOne(id, businessId);
    Object.assign(rule, dto);
    return this.repo.save(rule);
  }

  async remove(id: string, businessId: string): Promise<void> {
    const rule = await this.findOne(id, businessId);
    await this.repo.remove(rule);
  }

  async autoAssign(businessId: string): Promise<string | null> {
    const rules = await this.repo.find({
      where: { businessId, enabled: true },
      order: { priority: 'DESC' },
    });

    for (const rule of rules) {
      if (!rule.agents || rule.agents.length === 0) continue;

      switch (rule.strategy) {
        case AssignmentStrategy.ROUND_ROBIN: {
          const nextIndex = (rule.lastAssignedIndex + 1) % rule.agents.length;
          const agent = rule.agents[nextIndex];
          rule.lastAssignedIndex = nextIndex;
          await this.repo.save(rule);
          this.logger.log(`Auto-assigned to ${agent} via round-robin rule "${rule.name}"`);
          return agent;
        }
        case AssignmentStrategy.LEAST_ACTIVE:
          return rule.agents[0] ?? null;
        default:
          continue;
      }
    }

    return null;
  }
}

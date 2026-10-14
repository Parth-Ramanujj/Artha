import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbTest, AbTestStatus } from './entities/ab-test.entity';
import { CreateAbTestDto, UpdateAbTestDto } from './dto/ab-test.dto';

@Injectable()
export class AbTestService {
  constructor(@InjectRepository(AbTest, 'data') private readonly repo: Repository<AbTest>) {}

  async findAll(businessId: string) {
    return this.repo.find({ where: { businessId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, businessId: string) {
    const test = await this.repo.findOne({ where: { id, businessId } });
    if (!test) throw new NotFoundException('A/B test not found');
    return test;
  }

  async create(businessId: string, dto: CreateAbTestDto) {
    const totalWeight = dto.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 1) {
      throw new BadRequestException('Variant weights must sum to 100');
    }
    const test = this.repo.create({
      ...dto,
      businessId,
      status: AbTestStatus.DRAFT,
      results: null,
    });
    return this.repo.save(test);
  }

  async update(id: string, businessId: string, dto: UpdateAbTestDto) {
    const test = await this.findOne(id, businessId);
    if (dto.variants) {
      const totalWeight = dto.variants.reduce((sum, v) => sum + v.weight, 0);
      if (Math.abs(totalWeight - 100) > 1) {
        throw new BadRequestException('Variant weights must sum to 100');
      }
    }
    Object.assign(test, dto);
    return this.repo.save(test);
  }

  async start(id: string, businessId: string) {
    const test = await this.findOne(id, businessId);
    if (test.status !== AbTestStatus.DRAFT && test.status !== AbTestStatus.PAUSED) {
      throw new BadRequestException('Can only start draft or paused tests');
    }
    test.status = AbTestStatus.RUNNING;
    test.startedAt = new Date();
    const results: Record<string, { sent: number; delivered: number; replied: number }> = {};
    for (const v of test.variants) {
      results[v.id] = { sent: 0, delivered: 0, replied: 0 };
    }
    test.results = results;
    return this.repo.save(test);
  }

  async complete(id: string, businessId: string) {
    const test = await this.findOne(id, businessId);
    if (test.status !== AbTestStatus.RUNNING) {
      throw new BadRequestException('Can only complete running tests');
    }
    test.status = AbTestStatus.COMPLETED;
    test.completedAt = new Date();
    if (test.results) {
      let bestId: string | null = null;
      let bestRate = -1;
      for (const [vid, stats] of Object.entries(test.results)) {
        const rate = stats.sent > 0 ? stats.replied / stats.sent : 0;
        if (rate > bestRate) {
          bestRate = rate;
          bestId = vid;
        }
      }
      test.winningVariantId = bestId;
    }
    return this.repo.save(test);
  }

  async remove(id: string, businessId: string) {
    const test = await this.findOne(id, businessId);
    await this.repo.remove(test);
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CannedResponse } from './entities/canned-response.entity';
import { CreateCannedResponseDto, UpdateCannedResponseDto } from './dto/canned-response.dto';

@Injectable()
export class CannedResponseService {
  constructor(
    @InjectRepository(CannedResponse, 'data')
    private readonly repo: Repository<CannedResponse>,
  ) {}

  async findAll(
    businessId: string,
    opts: { category?: string; search?: string; limit?: number; offset?: number } = {},
  ): Promise<CannedResponse[]> {
    const qb = this.repo.createQueryBuilder('cr');
    if (businessId) {
      qb.where("(cr.businessId = :businessId OR cr.businessId = '' OR cr.businessId IS NULL)", { businessId });
    }

    if (opts.category) qb.andWhere('cr.category = :category', { category: opts.category });
    if (opts.search) {
      qb.andWhere('(cr.title LIKE :s OR cr.shortcut LIKE :s OR cr.content LIKE :s)', { s: `%${opts.search}%` });
    }

    qb.orderBy('cr.title', 'ASC');
    qb.take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);

    return qb.getMany();
  }

  async findOne(id: string, businessId: string): Promise<CannedResponse> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Canned response not found');
    if (item.businessId !== businessId) throw new ForbiddenException('Not authorized');
    return item;
  }

  async findByShortcut(businessId: string, shortcut: string): Promise<CannedResponse | null> {
    return this.repo.findOne({ where: { businessId, shortcut } });
  }

  async create(businessId: string, dto: CreateCannedResponseDto, createdBy?: string): Promise<CannedResponse> {
    const item = this.repo.create({
      businessId,
      ...dto,
      createdBy: createdBy ?? null,
    });
    return this.repo.save(item);
  }

  async update(id: string, businessId: string, dto: UpdateCannedResponseDto): Promise<CannedResponse> {
    const item = await this.findOne(id, businessId);
    if (dto.title !== undefined) item.title = dto.title;
    if (dto.shortcut !== undefined) item.shortcut = dto.shortcut;
    if (dto.content !== undefined) item.content = dto.content;
    if (dto.category !== undefined) item.category = dto.category ?? null;
    return this.repo.save(item);
  }

  async remove(id: string, businessId: string): Promise<void> {
    const item = await this.findOne(id, businessId);
    await this.repo.remove(item);
  }
}

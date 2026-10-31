import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactSegment } from './entities/contact-segment.entity';
import { Contact } from './entities/contact.entity';
import { CreateContactSegmentDto, UpdateContactSegmentDto } from './dto/contact-segment.dto';
import { scalarToString } from '../../common/utils/scalar-string';

@Injectable()
export class ContactSegmentService {
  constructor(
    @InjectRepository(ContactSegment, 'data')
    private readonly segmentRepo: Repository<ContactSegment>,
    @InjectRepository(Contact, 'data')
    private readonly contactRepo: Repository<Contact>,
  ) {}

  async findAll(businessId: string, opts: { limit?: number; offset?: number } = {}): Promise<ContactSegment[]> {
    const qb = this.segmentRepo.createQueryBuilder('s').where('s.businessId = :businessId', { businessId });
    qb.orderBy('s.name', 'ASC');
    qb.take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);
    return qb.getMany();
  }

  async findOne(id: string, businessId: string): Promise<ContactSegment> {
    const seg = await this.segmentRepo.findOne({ where: { id } });
    if (!seg) throw new NotFoundException('Segment not found');
    if (seg.businessId !== businessId) throw new ForbiddenException('Not authorized');
    return seg;
  }

  async create(businessId: string, dto: CreateContactSegmentDto, createdBy?: string): Promise<ContactSegment> {
    const seg = this.segmentRepo.create({
      businessId,
      ...dto,
      createdBy: createdBy ?? null,
    });
    const saved = await this.segmentRepo.save(seg);
    await this.refreshCount(saved.id, businessId);
    return this.findOne(saved.id, businessId);
  }

  async update(id: string, businessId: string, dto: UpdateContactSegmentDto): Promise<ContactSegment> {
    const seg = await this.findOne(id, businessId);
    Object.assign(seg, dto);
    const saved = await this.segmentRepo.save(seg);
    await this.refreshCount(saved.id, businessId);
    return this.findOne(saved.id, businessId);
  }

  async remove(id: string, businessId: string): Promise<void> {
    const seg = await this.findOne(id, businessId);
    await this.segmentRepo.remove(seg);
  }

  async getContacts(
    id: string,
    businessId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Contact[]> {
    const seg = await this.findOne(id, businessId);

    if (seg.type === 'static' && seg.staticContactIds?.length) {
      const qb = this.contactRepo
        .createQueryBuilder('c')
        .where('c.businessId = :businessId', { businessId })
        .andWhere('c.id IN (:...ids)', { ids: seg.staticContactIds });
      qb.take(opts.limit ?? 50);
      if (opts.offset) qb.skip(opts.offset);
      return qb.getMany();
    }

    if (seg.type === 'dynamic' && seg.filters) {
      return this.queryByFilters(businessId, seg.filters, opts);
    }

    return [];
  }

  private async queryByFilters(
    businessId: string,
    filters: Record<string, unknown>,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Contact[]> {
    const qb = this.contactRepo.createQueryBuilder('c').where('c.businessId = :businessId', { businessId });

    if (filters['tags'] && Array.isArray(filters['tags'])) {
      for (const tag of filters['tags'] as string[]) {
        qb.andWhere('c.tags LIKE :tag', { tag: `%${tag}%` });
      }
    }
    if (filters['hasEmail']) qb.andWhere('c.email IS NOT NULL');
    if (filters['hasPhone']) qb.andWhere('c.phone IS NOT NULL');
    if (filters['nameContains']) {
      qb.andWhere('c.name LIKE :name', { name: `%${scalarToString(filters['nameContains'])}%` });
    }

    qb.take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);
    return qb.getMany();
  }

  private async refreshCount(id: string, businessId: string): Promise<void> {
    const seg = await this.segmentRepo.findOne({ where: { id } });
    if (!seg) return;

    let count = 0;
    if (seg.type === 'static') {
      count = seg.staticContactIds?.length ?? 0;
    } else if (seg.filters) {
      const contacts = await this.queryByFilters(businessId, seg.filters, { limit: 10000 });
      count = contacts.length;
    }

    seg.contactCount = count;
    await this.segmentRepo.save(seg);
  }
}

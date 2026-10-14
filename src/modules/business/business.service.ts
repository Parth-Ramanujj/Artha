import { Injectable, NotFoundException, ConflictException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from './entities/business.entity';
import { BusinessMembership, BusinessRole } from './entities/business-membership.entity';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { AddMembershipDto, UpdateMembershipDto } from './dto/add-membership.dto';
import { createLogger } from '../../common/services/logger.service';
import { ApiKey } from '../auth/entities/api-key.entity';

@Injectable()
export class BusinessService implements OnModuleInit {
  private readonly logger = createLogger('BusinessService');

  constructor(
    @InjectRepository(Business, 'data')
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(BusinessMembership, 'data')
    private readonly membershipRepo: Repository<BusinessMembership>,
    @InjectRepository(ApiKey, 'main')
    private readonly apiKeyRepo: Repository<ApiKey>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.getOrCreateDefaultBusiness();
    } catch (err) {
      this.logger.warn('Failed to ensure default business at startup', { error: (err as Error).message });
    }
  }

  async create(dto: CreateBusinessDto): Promise<Business> {
    const rawName = (dto.name || '').trim();
    if (!rawName) {
      throw new ConflictException('Business name is required');
    }

    let slug = dto.slug ? this.generateSlug(dto.slug) : this.generateSlug(rawName);
    if (!slug) {
      slug = `ws-${Date.now()}`;
    }

    const existing = await this.businessRepo.findOne({ where: [{ name: rawName }, { slug }] });
    if (existing) {
      throw new ConflictException(
        existing.name === rawName ? 'Business name already exists' : 'Business slug already exists',
      );
    }

    const business = this.businessRepo.create({
      name: rawName,
      slug,
      plan: dto.plan ?? 'free',
      settings: dto.settings ?? null,
    });
    const saved = await this.businessRepo.save(business);
    this.logger.log('Business created', { businessId: saved.id, name: saved.name });
    return saved;
  }

  async findAll(callerBusinessId?: string | null): Promise<Business[]> {
    if (callerBusinessId) {
      return this.businessRepo.find({ where: { id: callerBusinessId } });
    }
    return this.businessRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Business> {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  async findBySlug(slug: string): Promise<Business | null> {
    return this.businessRepo.findOne({ where: { slug } });
  }

  async update(id: string, dto: UpdateBusinessDto): Promise<Business> {
    const business = await this.findOne(id);
    if (dto.name !== undefined) business.name = dto.name.trim();
    if (dto.slug !== undefined) {
      const cleanSlug = this.generateSlug(dto.slug);
      if (cleanSlug) business.slug = cleanSlug;
    }
    if (dto.plan !== undefined) business.plan = dto.plan;
    if (dto.isActive !== undefined) business.isActive = dto.isActive;
    if (dto.settings !== undefined) business.settings = dto.settings;
    return this.businessRepo.save(business);
  }

  async remove(id: string): Promise<void> {
    const business = await this.findOne(id);
    await this.businessRepo.remove(business);
    this.logger.log('Business deleted', { businessId: id });
  }

  async addMembership(businessId: string, dto: AddMembershipDto): Promise<BusinessMembership> {
    await this.findOne(businessId);

    const apiKey = await this.apiKeyRepo.findOne({ where: { id: dto.apiKeyId } });
    if (!apiKey) throw new NotFoundException('API key not found');

    const existingMembership = await this.membershipRepo.findOne({ where: { apiKeyId: dto.apiKeyId } });
    if (existingMembership) {
      if (existingMembership.businessId === businessId) {
        throw new ConflictException('API key is already a member of this business');
      }
      throw new ConflictException('API key already belongs to another business');
    }

    const membership = this.membershipRepo.create({
      businessId,
      apiKeyId: dto.apiKeyId,
      businessRole: dto.businessRole ?? BusinessRole.AGENT,
    });
    const saved = await this.membershipRepo.save(membership);

    if (!apiKey.businessId) {
      apiKey.businessId = businessId;
      await this.apiKeyRepo.save(apiKey);
    }

    this.logger.log('Membership added', {
      businessId,
      apiKeyId: dto.apiKeyId,
      role: saved.businessRole,
    });
    return saved;
  }

  async listMemberships(businessId: string): Promise<BusinessMembership[]> {
    await this.findOne(businessId);
    return this.membershipRepo.find({ where: { businessId }, order: { createdAt: 'ASC' } });
  }

  async updateMembership(
    businessId: string,
    membershipId: string,
    dto: UpdateMembershipDto,
  ): Promise<BusinessMembership> {
    const membership = await this.membershipRepo.findOne({ where: { id: membershipId, businessId } });
    if (!membership) throw new NotFoundException('Membership not found');
    membership.businessRole = dto.businessRole;
    return this.membershipRepo.save(membership);
  }

  async removeMembership(businessId: string, membershipId: string): Promise<void> {
    const membership = await this.membershipRepo.findOne({ where: { id: membershipId, businessId } });
    if (!membership) throw new NotFoundException('Membership not found');
    await this.membershipRepo.remove(membership);

    const apiKey = await this.apiKeyRepo.findOne({ where: { id: membership.apiKeyId } });
    if (apiKey && apiKey.businessId === businessId) {
      apiKey.businessId = null;
      await this.apiKeyRepo.save(apiKey);
    }

    this.logger.log('Membership removed', { businessId, membershipId });
  }

  async resolveBusinessForApiKey(apiKeyId: string): Promise<string | null> {
    const membership = await this.membershipRepo.findOne({ where: { apiKeyId } });
    return membership?.businessId ?? null;
  }

  assertBusinessAccess(callerBusinessId: string | null | undefined, targetBusinessId: string): void {
    if (!callerBusinessId) return;
    if (callerBusinessId !== targetBusinessId) {
      throw new ForbiddenException('Access denied to this business');
    }
  }

  async getOrCreateDefaultBusiness(): Promise<Business> {
    const existing = await this.businessRepo.findOne({ where: { slug: 'default' } });
    if (existing) return existing;
    return this.create({ name: 'Default', slug: 'default' });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }
}

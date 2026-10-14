import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncConfig, SyncProvider, SyncStatus } from './entities/sync-config.entity';
import { CreateSyncConfigDto, UpdateSyncConfigDto } from './dto/sync-config.dto';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(@InjectRepository(SyncConfig, 'data') private readonly repo: Repository<SyncConfig>) {}

  async findAll(businessId: string, provider?: string) {
    const where: Record<string, unknown> = { businessId };
    if (provider) where.provider = provider;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, businessId: string) {
    const config = await this.repo.findOne({ where: { id, businessId } });
    if (!config) throw new NotFoundException('Sync config not found');
    return config;
  }

  async create(businessId: string, dto: CreateSyncConfigDto) {
    const validProviders = Object.values(SyncProvider);
    if (!validProviders.includes(dto.provider as SyncProvider)) {
      throw new BadRequestException(`Invalid provider. Valid: ${validProviders.join(', ')}`);
    }
    const config = this.repo.create({ ...dto, businessId, status: SyncStatus.PAUSED });
    return this.repo.save(config);
  }

  async update(id: string, businessId: string, dto: UpdateSyncConfigDto) {
    const config = await this.findOne(id, businessId);
    Object.assign(config, dto);
    return this.repo.save(config);
  }

  async triggerSync(id: string, businessId: string) {
    const config = await this.findOne(id, businessId);
    if (!config.enabled) throw new BadRequestException('Sync is disabled');

    config.lastSyncAt = new Date();
    config.status = SyncStatus.ACTIVE;

    this.logger.log(`Sync triggered for ${config.provider} - ${config.name} (${config.dataType})`);

    config.syncedCount += 1;
    return this.repo.save(config);
  }

  async remove(id: string, businessId: string) {
    const config = await this.findOne(id, businessId);
    await this.repo.remove(config);
  }

  getSupportedProviders() {
    return [
      {
        provider: SyncProvider.GOOGLE_SHEETS,
        label: 'Google Sheets',
        dataTypes: ['contacts', 'conversations', 'leads'],
        description: 'Sync data to/from Google Sheets in real-time',
      },
      {
        provider: SyncProvider.ZOHO_CRM,
        label: 'Zoho CRM',
        dataTypes: ['contacts', 'leads', 'deals'],
        description: 'Sync contacts and leads with Zoho CRM',
      },
      {
        provider: SyncProvider.HUBSPOT,
        label: 'HubSpot',
        dataTypes: ['contacts', 'deals', 'tickets'],
        description: 'Sync contacts and deals with HubSpot',
      },
      {
        provider: SyncProvider.SALESFORCE,
        label: 'Salesforce',
        dataTypes: ['contacts', 'leads', 'opportunities'],
        description: 'Sync contacts and leads with Salesforce',
      },
    ];
  }
}

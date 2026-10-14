import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType, IntegrationStatus } from './entities/integration.entity';
import { CreateIntegrationDto, UpdateIntegrationDto } from './dto/integration.dto';

@Injectable()
export class IntegrationService {
  constructor(@InjectRepository(Integration, 'data') private readonly repo: Repository<Integration>) {}

  async findAll(businessId: string, type?: string) {
    const where: Record<string, unknown> = { businessId };
    if (type) where.type = type;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, businessId: string) {
    const integration = await this.repo.findOne({ where: { id, businessId } });
    if (!integration) throw new NotFoundException('Integration not found');
    return integration;
  }

  async create(businessId: string, dto: CreateIntegrationDto) {
    const validTypes = Object.values(IntegrationType);
    if (!validTypes.includes(dto.type as IntegrationType)) {
      throw new BadRequestException(`Invalid integration type. Valid types: ${validTypes.join(', ')}`);
    }
    const integration = this.repo.create({
      ...dto,
      businessId,
      status: IntegrationStatus.PENDING,
    });
    return this.repo.save(integration);
  }

  async update(id: string, businessId: string, dto: UpdateIntegrationDto) {
    const integration = await this.findOne(id, businessId);
    Object.assign(integration, dto);
    return this.repo.save(integration);
  }

  async connect(id: string, businessId: string) {
    const integration = await this.findOne(id, businessId);
    integration.status = IntegrationStatus.CONNECTED;
    integration.lastError = null;
    return this.repo.save(integration);
  }

  async disconnect(id: string, businessId: string) {
    const integration = await this.findOne(id, businessId);
    integration.status = IntegrationStatus.DISCONNECTED;
    return this.repo.save(integration);
  }

  async remove(id: string, businessId: string) {
    const integration = await this.findOne(id, businessId);
    await this.repo.remove(integration);
  }

  getAvailableTypes() {
    return [
      {
        type: IntegrationType.CRM_ZOHO,
        label: 'Zoho CRM',
        category: 'crm',
        description: 'Sync contacts and deals with Zoho CRM',
      },
      {
        type: IntegrationType.CRM_HUBSPOT,
        label: 'HubSpot',
        category: 'crm',
        description: 'Sync contacts and deals with HubSpot',
      },
      {
        type: IntegrationType.CRM_SALESFORCE,
        label: 'Salesforce',
        category: 'crm',
        description: 'Sync contacts and leads with Salesforce',
      },
      {
        type: IntegrationType.ECOM_SHOPIFY,
        label: 'Shopify',
        category: 'ecommerce',
        description: 'Sync orders and customers with Shopify',
      },
      {
        type: IntegrationType.ECOM_WOOCOMMERCE,
        label: 'WooCommerce',
        category: 'ecommerce',
        description: 'Sync orders and customers with WooCommerce',
      },
      {
        type: IntegrationType.CALENDAR_GOOGLE,
        label: 'Google Calendar',
        category: 'calendar',
        description: 'Book appointments via Google Calendar',
      },
    ];
  }
}

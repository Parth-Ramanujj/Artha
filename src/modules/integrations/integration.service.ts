import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType, IntegrationStatus } from './entities/integration.entity';
import { CreateIntegrationDto, UpdateIntegrationDto } from './dto/integration.dto';

@Injectable()
export class IntegrationService {
  constructor(@InjectRepository(Integration, 'data') private readonly repo: Repository<Integration>) {}

  async findAll(businessId: string, type?: string) {
    const effectiveBusinessId = businessId || 'default';
    const where: any = [
      { businessId: effectiveBusinessId },
      { businessId: 'default' },
      { businessId: '' },
    ];
    if (type) {
      where.forEach((w: any) => (w.type = type));
    }
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, businessId: string) {
    const effectiveBusinessId = businessId || 'default';
    const integration = await this.repo.findOne({
      where: [
        { id, businessId: effectiveBusinessId },
        { id, businessId: 'default' },
        { id, businessId: '' },
      ],
    });
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

  async testConnection(id: string, businessId: string) {
    const integration = await this.findOne(id, businessId);
    const targetUrl =
      integration.config?.webhookUrl ||
      integration.config?.url ||
      integration.config?.apiUrl ||
      integration.config?.endpoint;

    if (!targetUrl && !integration.config?.apiKey) {
      return {
        success: false,
        message: 'No Webhook URL or API Key configured for this integration',
      };
    }

    if (targetUrl) {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      try {
        const res = await fetch(String(targetUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'OpenWA-Integration-Probe/1.0',
            ...(integration.config?.apiKey ? { Authorization: `Bearer ${integration.config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            event: 'integration.verify',
            integrationId: integration.id,
            type: integration.type,
            name: integration.name,
            timestamp: new Date().toISOString(),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const latencyMs = Date.now() - startTime;

        if (res.ok || res.status === 200 || res.status === 201 || res.status === 204) {
          integration.status = IntegrationStatus.CONNECTED;
          integration.lastError = null;
          await this.repo.save(integration);
          return {
            success: true,
            statusCode: res.status,
            latencyMs,
            message: `Connected successfully (${latencyMs}ms)`,
          };
        } else {
          integration.status = IntegrationStatus.ERROR;
          integration.lastError = `Target returned HTTP ${res.status}: ${res.statusText}`;
          await this.repo.save(integration);
          return {
            success: false,
            statusCode: res.status,
            latencyMs,
            message: integration.lastError,
          };
        }
      } catch (err: any) {
        clearTimeout(timeout);
        integration.status = IntegrationStatus.ERROR;
        integration.lastError = `Connection failed: ${err.message}`;
        await this.repo.save(integration);
        return {
          success: false,
          latencyMs: Date.now() - startTime,
          message: integration.lastError,
        };
      }
    }

    integration.status = IntegrationStatus.CONNECTED;
    integration.lastError = null;
    await this.repo.save(integration);
    return {
      success: true,
      message: 'Credentials saved and integration connected',
    };
  }

  async connect(id: string, businessId: string) {
    const res = await this.testConnection(id, businessId);
    if (!res.success && res.message.includes('HTTP')) {
      throw new BadRequestException(res.message);
    }
    return this.findOne(id, businessId);
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

import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType, IntegrationStatus } from './entities/integration.entity';
import { CreateIntegrationDto, UpdateIntegrationDto } from './dto/integration.dto';
import * as nodemailer from 'nodemailer';
import { GoogleWorkspaceService, isGoogleType } from './google/google-workspace.service';

/** The SMTP settings an email integration keeps in its config. */
export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName?: string;
}

export function readSmtpConfig(config: Record<string, unknown> | null | undefined): SmtpConfig {
  const c = config ?? {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const port = Number(c.port ?? 587);
  const smtp: SmtpConfig = {
    host: str(c.host),
    port,
    secure: c.secure === true || c.secure === 'true' || port === 465,
    username: str(c.username),
    password: str(c.password),
    fromAddress: str(c.fromAddress),
    fromName: str(c.fromName) || undefined,
  };
  const missing: string[] = (['host', 'username', 'password', 'fromAddress'] as const).filter(k => !smtp[k]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push('port');
  if (missing.length) throw new BadRequestException(`Email settings missing: ${missing.join(', ')}`);
  return smtp;
}

@Injectable()
export class IntegrationService {
  constructor(
    @InjectRepository(Integration, 'data') private readonly repo: Repository<Integration>,
    @Optional() private readonly google?: GoogleWorkspaceService,
  ) {}

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
    if (integration.type === IntegrationType.EMAIL_SMTP) {
      return this.verifySmtp(integration.config);
    }
    if (isGoogleType(integration.type)) {
      if (!this.google) return { success: false, message: 'Google sign-in is not available' };
      return this.google.verify(integration);
    }
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
    if (isGoogleType(integration.type) && this.google) {
      await this.google.revoke(integration);
    }
    integration.status = IntegrationStatus.DISCONNECTED;
    return this.repo.save(integration);
  }

  async remove(id: string, businessId: string) {
    const integration = await this.findOne(id, businessId);
    if (isGoogleType(integration.type) && this.google) {
      await this.google.revoke(integration);
    }
    await this.repo.remove(integration);
  }

  /** Logs in to the SMTP server with the saved settings; nothing is sent. */
  async verifySmtp(config: Record<string, unknown> | null | undefined) {
    const smtp = readSmtpConfig(config);
    const transport = this.smtpTransport(smtp);
    try {
      await transport.verify();
      return { success: true, message: `Connected to ${smtp.host}:${smtp.port} as ${smtp.username}` };
    } catch (err) {
      return { success: false, message: `SMTP login failed: ${(err as Error).message}` };
    } finally {
      transport.close();
    }
  }

  /** Sends one email through the integration's SMTP account. */
  async sendEmail(id: string, businessId: string, msg: { to: string; subject: string; text: string }) {
    const integration = await this.findOne(id, businessId);
    if (integration.type !== IntegrationType.EMAIL_SMTP) {
      throw new BadRequestException('This integration is not an email integration');
    }
    const smtp = readSmtpConfig(integration.config);
    const transport = this.smtpTransport(smtp);
    try {
      const info = await transport.sendMail({
        from: smtp.fromName ? `"${smtp.fromName.replace(/"/g, '')}" <${smtp.fromAddress}>` : smtp.fromAddress,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      });
      return { success: true, messageId: info.messageId };
    } finally {
      transport.close();
    }
  }

  private smtpTransport(smtp: SmtpConfig) {
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.username, pass: smtp.password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
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
      {
        type: IntegrationType.EMAIL_SMTP,
        label: 'Email (SMTP)',
        category: 'email',
        description: 'Send emails from your own mailbox through any SMTP server',
      },
      {
        type: IntegrationType.GOOGLE_GMAIL,
        label: 'Gmail',
        category: 'google',
        description: 'Send emails from your own Google account',
      },
      {
        type: IntegrationType.GOOGLE_CALENDAR,
        label: 'Google Calendar (sign-in)',
        category: 'google',
        description: 'Read and create events in your Google Calendar',
      },
      {
        type: IntegrationType.GOOGLE_SHEETS,
        label: 'Google Sheets',
        category: 'google',
        description: 'Add rows to spreadsheets you choose',
      },
      {
        type: IntegrationType.GOOGLE_DRIVE,
        label: 'Google Drive',
        category: 'google',
        description: 'Files this app creates in your Google Drive',
      },
    ];
  }
}

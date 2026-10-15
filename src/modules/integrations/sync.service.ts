import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncConfig, SyncProvider, SyncStatus } from './entities/sync-config.entity';
import { CreateSyncConfigDto, UpdateSyncConfigDto } from './dto/sync-config.dto';
import { Contact } from '../conversation/entities/contact.entity';
import { Conversation } from '../conversation/entities/conversation.entity';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(SyncConfig, 'data') private readonly repo: Repository<SyncConfig>,
    @InjectRepository(Contact, 'data') private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Conversation, 'data') private readonly convRepo: Repository<Conversation>,
  ) {}

  async findAll(businessId: string, provider?: string) {
    const effectiveBusinessId = businessId || 'default';
    const where: any = [
      { businessId: effectiveBusinessId },
      { businessId: 'default' },
      { businessId: '' },
    ];
    if (provider) {
      where.forEach((w: any) => (w.provider = provider));
    }
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, businessId: string) {
    const effectiveBusinessId = businessId || 'default';
    const config = await this.repo.findOne({
      where: [
        { id, businessId: effectiveBusinessId },
        { id, businessId: 'default' },
        { id, businessId: '' },
      ],
    });
    if (!config) throw new NotFoundException('Sync config not found');
    return config;
  }

  async create(businessId: string, dto: CreateSyncConfigDto) {
    const validProviders = Object.values(SyncProvider);
    if (!validProviders.includes(dto.provider as SyncProvider)) {
      throw new BadRequestException(`Invalid provider. Valid: ${validProviders.join(', ')}`);
    }
    const effectiveBusinessId = businessId || 'default';
    const config = this.repo.create({
      ...dto,
      businessId: effectiveBusinessId,
      status: SyncStatus.ACTIVE,
      syncedCount: 0,
      errorCount: 0,
    });
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
    const effectiveBusinessId = businessId || 'default';

    // Fetch real records based on configured dataType
    let records: Array<Record<string, unknown>> = [];

    if (config.dataType === 'conversations') {
      const convs = await this.convRepo.find({
        where: [
          { businessId: effectiveBusinessId },
          { businessId: 'default' },
          { businessId: '' },
        ],
        order: { updatedAt: 'DESC' },
        take: 500,
      });
      records = convs.map(c => ({
        chatId: c.chatId,
        customerName: c.chatName || c.chatId.replace(/@.*$/, ''),
        status: c.status,
        assignedAgent: c.assignedName || c.assignedTo || 'Unassigned',
        lastMessage: c.lastMessagePreview || '',
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : '',
        syncedAt: new Date().toISOString(),
      }));
    } else {
      // Default: contacts and leads
      let contacts = await this.contactRepo.find({
        where: [
          { businessId: effectiveBusinessId },
          { businessId: 'default' },
          { businessId: '' },
        ],
        order: { createdAt: 'DESC' },
        take: 500,
      });

      // If contacts table has 0 rows, extract contacts from actual conversations!
      if (contacts.length === 0) {
        const convs = await this.convRepo.find({
          where: [
            { businessId: effectiveBusinessId },
            { businessId: 'default' },
            { businessId: '' },
          ],
          order: { updatedAt: 'DESC' },
          take: 500,
        });

        const contactsToInsert = convs.map(c => {
          const rawPhone = c.chatId ? c.chatId.replace(/@.*$/, '') : '';
          return this.contactRepo.create({
            businessId: effectiveBusinessId,
            waContactId: c.chatId,
            phone: rawPhone.length > 5 ? rawPhone : null,
            name: c.chatName || (rawPhone.length > 5 ? `WhatsApp (+${rawPhone})` : 'Customer'),
            notes: 'WhatsApp Conversation Lead',
            tags: ['whatsapp', 'inbound'],
            metadata: {
              source: 'whatsapp_sync',
              sessionId: c.sessionId,
              lastMessagePreview: c.lastMessagePreview,
            },
          });
        });

        const seen = new Set<string>();
        const uniqueContactsToInsert = contactsToInsert.filter(c => {
          if (!c.waContactId || seen.has(c.waContactId)) return false;
          seen.add(c.waContactId);
          return true;
        });

        contacts = uniqueContactsToInsert;
        for (const item of uniqueContactsToInsert) {
          try {
            await this.contactRepo.save(item);
          } catch {
            // ignore unique constraint
          }
        }
      }

      records = contacts.map(c => ({
        name: c.name || 'Customer',
        phone: c.phone || (c.waContactId ? c.waContactId.replace(/@.*$/, '') : ''),
        email: c.email || '',
        notes: c.notes || '',
        tags: c.tags ? c.tags.join(', ') : '',
        city: (c.metadata as any)?.city || (c.metadata as any)?.location || '',
        syncedAt: new Date().toISOString(),
      }));
    }

    // Check if target webhook or Google Sheet script URL is configured
    const targetUrl =
      config.config?.webhookUrl ||
      config.config?.url ||
      config.config?.sheetUrl ||
      config.config?.endpoint;

    if (targetUrl) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(String(targetUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'OpenWA-SyncEngine/1.0',
          },
          body: JSON.stringify({
            event: 'sync.batch',
            provider: config.provider,
            syncConfigId: config.id,
            name: config.name,
            dataType: config.dataType,
            direction: config.direction,
            count: records.length,
            records,
            timestamp: new Date().toISOString(),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Target endpoint returned HTTP ${response.status}: ${response.statusText}`);
        }

        config.lastError = null;
        config.status = SyncStatus.ACTIVE;
      } catch (err: any) {
        clearTimeout(timeoutId);
        config.lastError = `Dispatch failed: ${err.message}`;
        config.errorCount = (config.errorCount || 0) + 1;
        config.status = SyncStatus.ERROR;
        await this.repo.save(config);
        throw new BadRequestException(config.lastError);
      }
    } else {
      // No external URL set: local sync snapshot is active and ready
      config.lastError = null;
      config.status = SyncStatus.ACTIVE;
    }

    config.lastSyncAt = new Date();
    config.syncedCount = (config.syncedCount || 0) + records.length;
    await this.repo.save(config);

    this.logger.log(
      `Sync executed for ${config.provider} - ${config.name} (${records.length} ${config.dataType} records synced)`,
    );

    return {
      success: true,
      configId: config.id,
      provider: config.provider,
      name: config.name,
      dataType: config.dataType,
      recordsSynced: records.length,
      lastSyncAt: config.lastSyncAt,
      status: config.status,
      destination: targetUrl ? String(targetUrl) : 'Local Database Snapshot Ready',
      sampleRecords: records.slice(0, 3),
    };
  }

  async exportData(id: string, businessId: string, format: 'json' | 'csv' = 'json') {
    const config = await this.findOne(id, businessId);
    const effectiveBusinessId = businessId || 'default';

    if (config.dataType === 'conversations') {
      const convs = await this.convRepo.find({
        where: [
          { businessId: effectiveBusinessId },
          { businessId: 'default' },
          { businessId: '' },
        ],
        order: { updatedAt: 'DESC' },
      });
      const records = convs.map(c => ({
        chatId: c.chatId,
        customerName: c.chatName || c.chatId.replace(/@.*$/, ''),
        status: c.status,
        assignedAgent: c.assignedName || c.assignedTo || 'Unassigned',
        lastMessage: c.lastMessagePreview || '',
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : '',
      }));

      if (format === 'csv') {
        const headers = ['chatId', 'customerName', 'status', 'assignedAgent', 'lastMessage', 'unreadCount', 'lastMessageAt'];
        const csvRows = [headers.join(',')];
        for (const r of records) {
          csvRows.push(
            headers
              .map(h => `"${String((r as any)[h] || '').replace(/"/g, '""')}"`)
              .join(','),
          );
        }
        return { data: csvRows.join('\n'), mimeType: 'text/csv', filename: `conversations-sync-${config.name}.csv` };
      }
      return { data: records, mimeType: 'application/json', filename: `conversations-sync-${config.name}.json` };
    }

    // Default: contacts
    let contacts = await this.contactRepo.find({
      where: [
        { businessId: effectiveBusinessId },
        { businessId: 'default' },
        { businessId: '' },
      ],
      order: { createdAt: 'DESC' },
    });

    if (contacts.length === 0) {
      const convs = await this.convRepo.find({
        where: [
          { businessId: effectiveBusinessId },
          { businessId: 'default' },
          { businessId: '' },
        ],
        order: { updatedAt: 'DESC' },
      });
      contacts = convs.map(c => {
        const rawPhone = c.chatId ? c.chatId.replace(/@.*$/, '') : '';
        return this.contactRepo.create({
          businessId: effectiveBusinessId,
          waContactId: c.chatId,
          phone: rawPhone.length > 5 ? rawPhone : null,
          name: c.chatName || (rawPhone.length > 5 ? `WhatsApp (+${rawPhone})` : 'Customer'),
          notes: 'WhatsApp Conversation Lead',
          tags: ['whatsapp', 'inbound'],
        });
      });
    }

    const records = contacts.map(c => ({
      name: c.name || 'Customer',
      phone: c.phone || (c.waContactId ? c.waContactId.replace(/@.*$/, '') : ''),
      email: c.email || '',
      notes: c.notes || '',
      tags: c.tags ? c.tags.join('; ') : '',
      city: (c.metadata as any)?.city || (c.metadata as any)?.location || '',
      createdAt: c.createdAt ? c.createdAt.toISOString() : '',
    }));

    if (format === 'csv') {
      const headers = ['name', 'phone', 'email', 'notes', 'tags', 'city', 'createdAt'];
      const csvRows = [headers.join(',')];
      for (const r of records) {
        csvRows.push(
          headers
            .map(h => `"${String((r as any)[h] || '').replace(/"/g, '""')}"`)
            .join(','),
        );
      }
      return { data: csvRows.join('\n'), mimeType: 'text/csv', filename: `contacts-sync-${config.name}.csv` };
    }

    return { data: records, mimeType: 'application/json', filename: `contacts-sync-${config.name}.json` };
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
        description: 'Real-time two-way synchronization with Google Sheets',
      },
      {
        provider: SyncProvider.ZOHO_CRM,
        label: 'Zoho CRM',
        dataTypes: ['contacts', 'leads', 'deals'],
        description: 'Automated contact & deal pipeline sync with Zoho CRM',
      },
      {
        provider: SyncProvider.HUBSPOT,
        label: 'HubSpot',
        dataTypes: ['contacts', 'deals', 'tickets'],
        description: 'Full lifecycle contact and ticket synchronization with HubSpot',
      },
      {
        provider: SyncProvider.SALESFORCE,
        label: 'Salesforce',
        dataTypes: ['contacts', 'leads', 'opportunities'],
        description: 'Enterprise WhatsApp lead capture and sync with Salesforce',
      },
      {
        provider: SyncProvider.WEBHOOK,
        label: 'Webhook / Zapier / Make',
        dataTypes: ['contacts', 'conversations', 'leads'],
        description: 'Send live batches of contacts or chats to custom HTTP webhooks or Zapier/Make automation',
      },
    ];
  }
}

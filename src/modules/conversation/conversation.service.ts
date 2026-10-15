import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus } from './entities/conversation.entity';
import { Contact } from './entities/contact.entity';
import { UpdateConversationDto, CreateContactDto, UpdateContactDto } from './dto/conversation.dto';
import { BusinessService } from '../business/business.service';
import { AdvisorAlertService } from './advisor-alert.service';
import { FeedbackService } from './feedback.service';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(Conversation, 'data')
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Contact, 'data')
    private readonly contactRepo: Repository<Contact>,
    private readonly businessService: BusinessService,
    private readonly advisorAlerts: AdvisorAlertService,
    private readonly feedbackService: FeedbackService,
  ) {}

  async findAllConversations(
    businessId: string | null,
    opts: {
      sessionId?: string;
      status?: ConversationStatus;
      assignedTo?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Conversation[]> {
    const qb = this.conversationRepo.createQueryBuilder('c');
    if (businessId) qb.where('c.businessId = :businessId', { businessId });

    if (opts.sessionId) qb.andWhere('c.sessionId = :sessionId', { sessionId: opts.sessionId });
    if (opts.status) qb.andWhere('c.status = :status', { status: opts.status });
    if (opts.assignedTo) qb.andWhere('c.assignedTo = :assignedTo', { assignedTo: opts.assignedTo });

    qb.orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST');
    qb.take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);

    return qb.getMany();
  }

  async findOneConversation(id: string, businessId: string | null): Promise<Conversation> {
    const conv = await this.conversationRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (businessId && conv.businessId !== businessId)
      throw new ForbiddenException('Not authorized for this conversation');
    return conv;
  }

  async getOrCreateConversation(
    businessId: string | null,
    sessionId: string,
    chatId: string,
    chatName?: string,
  ): Promise<Conversation> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    const existing = await this.conversationRepo.findOne({ where: { sessionId, chatId } });
    if (existing) {
      if (chatName && chatName !== existing.chatName) {
        existing.chatName = chatName;
        await this.conversationRepo.save(existing);
      }
      return existing;
    }

    const conv = this.conversationRepo.create({
      businessId: targetBusinessId,
      sessionId,
      chatId,
      chatName: chatName ?? null,
      status: ConversationStatus.OPEN,
    });
    return this.conversationRepo.save(conv);
  }

  async updateConversation(id: string, businessId: string | null, dto: UpdateConversationDto): Promise<Conversation> {
    const conv = await this.findOneConversation(id, businessId);
    const previousAssignee = conv.assignedTo;
    const wasClosed = conv.status === ConversationStatus.CLOSED;

    if (dto.status !== undefined) conv.status = dto.status;
    if (dto.assignedTo !== undefined) conv.assignedTo = dto.assignedTo;
    if (dto.assignedName !== undefined) conv.assignedName = dto.assignedName;
    if (dto.tags !== undefined) conv.tags = dto.tags;

    const saved = await this.conversationRepo.save(conv);
    this.runPostUpdateHooks(saved, previousAssignee, wasClosed);
    return saved;
  }

  private runPostUpdateHooks(conv: Conversation, previousAssignee: string | null, wasClosed: boolean) {
    if (!conv.businessId) return;

    if (conv.assignedTo && conv.assignedTo !== previousAssignee) {
      this.advisorAlerts
        .alertConversationAssigned(
          conv.businessId,
          conv.id,
          conv.chatName || conv.chatId,
          conv.assignedName || conv.assignedTo,
        )
        .catch(err => this.logger.warn(`Advisor assignment alert failed: ${err}`));
    }

    if (conv.status === ConversationStatus.CLOSED && !wasClosed) {
      this.feedbackService
        .requestFeedbackViaWhatsApp(conv.businessId, {
          conversationId: conv.id,
          sessionId: conv.sessionId,
          chatId: conv.chatId,
        })
        .catch(err => this.logger.warn(`Feedback request failed: ${err}`));
    }
  }

  async updateLastMessage(
    sessionId: string,
    chatId: string,
    preview: string,
    timestamp: Date,
    fromMe: boolean,
  ): Promise<void> {
    await this.conversationRepo
      .createQueryBuilder()
      .update(Conversation)
      .set({
        lastMessageAt: timestamp,
        lastMessagePreview: preview?.substring(0, 200) ?? null,
        ...(fromMe ? {} : { lastInboundAt: timestamp }),
      })
      .where('sessionId = :sessionId AND chatId = :chatId', { sessionId, chatId })
      .execute();
  }

  async incrementUnread(sessionId: string, chatId: string): Promise<void> {
    await this.conversationRepo
      .createQueryBuilder()
      .update(Conversation)
      .set({ unreadCount: () => 'unreadCount + 1' })
      .where('sessionId = :sessionId AND chatId = :chatId', { sessionId, chatId })
      .execute();
  }

  async resetUnread(id: string, businessId: string | null): Promise<Conversation> {
    const conv = await this.findOneConversation(id, businessId);
    conv.unreadCount = 0;
    return this.conversationRepo.save(conv);
  }

  // ── Contact CRUD ──

  async findAllContacts(
    businessId: string | null,
    opts: { limit?: number; offset?: number; search?: string } = {},
  ): Promise<Contact[]> {
    const qb = this.contactRepo.createQueryBuilder('c');
    if (businessId) qb.where('c.businessId = :businessId', { businessId });

    if (opts.search) {
      qb.andWhere('(c.name LIKE :s OR c.phone LIKE :s OR c.waContactId LIKE :s)', { s: `%${opts.search}%` });
    }

    qb.orderBy('c.updatedAt', 'DESC');
    qb.take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);

    return qb.getMany();
  }

  async findOneContact(id: string, businessId: string | null): Promise<Contact> {
    const contact = await this.contactRepo.findOne({ where: { id } });
    if (!contact) throw new NotFoundException('Contact not found');
    if (businessId && contact.businessId !== businessId)
      throw new ForbiddenException('Not authorized for this contact');
    return contact;
  }

  async findContactByWaId(businessId: string, waContactId: string): Promise<Contact | null> {
    return this.contactRepo.findOne({ where: { businessId, waContactId } });
  }

  async createContact(businessId: string | null, dto: CreateContactDto): Promise<Contact> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    const contact = this.contactRepo.create({
      businessId: targetBusinessId,
      waContactId: dto.waContactId,
      phone: dto.phone ?? null,
      name: dto.name ?? null,
      email: dto.email ?? null,
      notes: dto.notes ?? null,
      tags: dto.tags ?? null,
    });
    return this.contactRepo.save(contact);
  }

  async updateContact(id: string, businessId: string | null, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOneContact(id, businessId);

    if (dto.name !== undefined) contact.name = dto.name;
    if (dto.email !== undefined) contact.email = dto.email;
    if (dto.notes !== undefined) contact.notes = dto.notes;
    if (dto.tags !== undefined) contact.tags = dto.tags;

    return this.contactRepo.save(contact);
  }

  async deleteContact(id: string, businessId: string | null): Promise<void> {
    const contact = await this.findOneContact(id, businessId);
    await this.contactRepo.remove(contact);
  }

  async getOrCreateContact(businessId: string, waContactId: string, name?: string, phone?: string): Promise<Contact> {
    const existing = await this.findContactByWaId(businessId, waContactId);
    if (existing) return existing;

    return this.createContact(businessId, { waContactId, name, phone });
  }

  // ── Contact Import/Export ──

  async importContactsCsv(
    businessId: string | null,
    csv: string,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    const lines = csv
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length < 2)
      return { imported: 0, skipped: 0, errors: ['CSV must have a header row and at least one data row'] };

    const header = lines[0].split(',').map(h =>
      h
        .trim()
        .toLowerCase()
        .replace(/^"(.*)"$/, '$1'),
    );
    const waIdIdx = header.indexOf('wacontactid') !== -1 ? header.indexOf('wacontactid') : header.indexOf('phone');
    if (waIdIdx === -1) return { imported: 0, skipped: 0, errors: ['CSV must have a "waContactId" or "phone" column'] };

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      header.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });

      const waContactId = row['wacontactid'] || row['phone'];
      if (!waContactId) {
        skipped++;
        continue;
      }

      try {
        const existing = await this.findContactByWaId(targetBusinessId, waContactId);
        if (existing) {
          if (row['name']) existing.name = row['name'];
          if (row['email']) existing.email = row['email'];
          if (row['phone']) existing.phone = row['phone'];
          if (row['notes']) existing.notes = row['notes'];
          if (row['tags'])
            existing.tags = row['tags']
              .split(';')
              .map(t => t.trim())
              .filter(Boolean);
          await this.contactRepo.save(existing);
        } else {
          const contact = this.contactRepo.create({
            businessId: targetBusinessId,
            waContactId,
            phone: row['phone'] || null,
            name: row['name'] || null,
            email: row['email'] || null,
            notes: row['notes'] || null,
            tags: row['tags']
              ? row['tags']
                  .split(';')
                  .map(t => t.trim())
                  .filter(Boolean)
              : null,
          });
          await this.contactRepo.save(contact);
        }
        imported++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { imported, skipped, errors };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    result.push(current.trim());
    return result;
  }

  async exportContactsCsv(businessId: string | null): Promise<string> {
    const contacts = await this.findAllContacts(businessId, { limit: 10000 });
    const header = 'waContactId,phone,name,email,notes,tags';
    const rows = contacts.map(c => {
      const esc = (v: string | null) => (v ? `"${v.replace(/"/g, '""')}"` : '');
      return [
        esc(c.waContactId),
        esc(c.phone),
        esc(c.name),
        esc(c.email),
        esc(c.notes),
        esc(c.tags?.join(';') ?? ''),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  async exportConversationsCsv(businessId: string | null): Promise<string> {
    const conversations = await this.findAllConversations(businessId, { limit: 10000 });
    const header = 'id,sessionId,chatId,chatName,status,assignedTo,assignedName,unreadCount,lastMessageAt,tags';
    const rows = conversations.map(c => {
      const esc = (v: string | null | undefined) => (v ? `"${v.replace(/"/g, '""')}"` : '');
      return [
        esc(c.id),
        esc(c.sessionId),
        esc(c.chatId),
        esc(c.chatName),
        esc(c.status),
        esc(c.assignedTo),
        esc(c.assignedName),
        String(c.unreadCount),
        c.lastMessageAt ? c.lastMessageAt.toISOString() : '',
        esc(c.tags?.join(';') ?? ''),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus } from './entities/conversation.entity';
import { Contact } from './entities/contact.entity';
import { UpdateConversationDto, CreateContactDto, UpdateContactDto } from './dto/conversation.dto';
import { BusinessService } from '../business/business.service';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation, 'data')
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Contact, 'data')
    private readonly contactRepo: Repository<Contact>,
    private readonly businessService: BusinessService,
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

    if (dto.status !== undefined) conv.status = dto.status;
    if (dto.assignedTo !== undefined) conv.assignedTo = dto.assignedTo;
    if (dto.assignedName !== undefined) conv.assignedName = dto.assignedName;
    if (dto.tags !== undefined) conv.tags = dto.tags;

    return this.conversationRepo.save(conv);
  }

  async updateLastMessage(sessionId: string, chatId: string, preview: string, timestamp: Date): Promise<void> {
    await this.conversationRepo
      .createQueryBuilder()
      .update(Conversation)
      .set({
        lastMessageAt: timestamp,
        lastMessagePreview: preview?.substring(0, 200) ?? null,
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
}

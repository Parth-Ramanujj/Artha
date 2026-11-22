import { DataSource, Repository } from 'typeorm';
import { DealService } from './deal.service';
import { Deal, DealStage } from './entities/deal.entity';
import { Contact } from './entities/contact.entity';
import { Conversation, ConversationStatus } from './entities/conversation.entity';

describe('DealService links a deal to its WhatsApp chat (SQLite)', () => {
  let ds: DataSource;
  let dealRepo: Repository<Deal>;
  let contactRepo: Repository<Contact>;
  let convoRepo: Repository<Conversation>;
  let service: DealService;

  const addChat = (chatId: string, businessId = 'biz', lastMessageAt = new Date('2026-11-20T10:00:00Z')) =>
    convoRepo.save(
      convoRepo.create({ businessId, sessionId: 's', chatId, status: ConversationStatus.OPEN, lastMessageAt }),
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Deal, Contact, Conversation],
      synchronize: true,
    });
    await ds.initialize();
    dealRepo = ds.getRepository(Deal);
    contactRepo = ds.getRepository(Contact);
    convoRepo = ds.getRepository(Conversation);
    service = new DealService(dealRepo, contactRepo, convoRepo);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('links the chat of the linked contact', async () => {
    const chat = await addChat('911111111111@c.us');
    const contact = await contactRepo.save(
      contactRepo.create({ businessId: 'biz', waContactId: '911111111111@c.us', name: 'Asha', phone: '911111111111' }),
    );

    const deal = await service.create('biz', { title: 'Order', contactId: contact.id });

    expect(deal.conversationId).toBe(chat.id);
  });

  it('links by phone, ignoring +, spaces and dashes', async () => {
    const chat = await addChat('919876543210@c.us');

    const deal = await service.create('biz', { title: 'Order', contactName: 'Ravi', contactPhone: '+91 98765-43210' });

    expect(deal.conversationId).toBe(chat.id);
  });

  it('never links a chat from another business, and leaves it null when no chat exists', async () => {
    await addChat('919876543210@c.us', 'other');

    const deal = await service.create('biz', { title: 'Order', contactName: 'Ravi', contactPhone: '919876543210' });

    expect(deal.conversationId).toBeNull();
  });

  it('links an older unlinked deal on its next update, and stamps the stage change', async () => {
    const deal = await service.create('biz', { title: 'Order', contactName: 'Ravi', contactPhone: '919876543210' });
    expect(deal.conversationId).toBeNull();
    const chat = await addChat('919876543210@c.us');

    const updated = await service.update(deal.id, 'biz', { stage: DealStage.PROPOSAL });

    expect(updated.conversationId).toBe(chat.id);
    expect(updated.stageChangedAt).not.toBeNull();
  });

  it('keeps an explicitly given conversation', async () => {
    await addChat('919876543210@c.us');
    const other = await addChat('912222222222@c.us');

    const deal = await service.create('biz', {
      title: 'Order',
      contactName: 'Ravi',
      contactPhone: '919876543210',
      conversationId: other.id,
    });

    expect(deal.conversationId).toBe(other.id);
  });
});

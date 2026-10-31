import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EngineRegistry } from '../../engine/engine-registry.service';
import type { MessageService } from '../message/message.service';
import { Message } from '../message/entities/message.entity';
import { EngineType, Session } from '../session/entities/session.entity';
import { ContactConsent, ConsentStatus } from '../campaign/entities/contact-consent.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { WorkflowDefinition, WorkflowStatus } from '../workflow/entities/workflow-definition.entity';
import { StudioMessage, StudioMessageStatus } from './entities/studio-message.entity';
import { StudioProduct } from './entities/studio-product.entity';
import { StudioSetting } from './entities/studio-setting.entity';
import { MessageStudioService, STUDIO_NODE_TYPE, toTemplateInfo } from './message-studio.service';

const BIZ = 'biz-1';

describe('MessageStudioService (real SQLite)', () => {
  let ds: DataSource;
  let service: MessageStudioService;
  let engines: Map<string, Record<string, jest.Mock>>;
  let messageService: Record<string, jest.Mock>;
  let session: Session;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        StudioMessage,
        StudioProduct,
        StudioSetting,
        Session,
        WorkflowDefinition,
        ContactConsent,
        Conversation,
        Message,
      ],
      synchronize: true,
    });
    await ds.initialize();
    engines = new Map();
    const registry = { get: (id: string) => engines.get(id) } as unknown as EngineRegistry;
    let n = 0;
    const sent = () => Promise.resolve({ messageId: `wamid.${++n}`, timestamp: 1 });
    messageService = {
      sendText: jest.fn(sent),
      sendImage: jest.fn(sent),
      sendVideo: jest.fn(sent),
      sendDocument: jest.fn(sent),
      sendLocation: jest.fn(sent),
      sendContact: jest.fn(sent),
    };
    service = new MessageStudioService(
      ds.getRepository(StudioMessage),
      ds.getRepository(StudioProduct),
      ds.getRepository(StudioSetting),
      ds.getRepository(Session),
      ds.getRepository(WorkflowDefinition),
      ds.getRepository(ContactConsent),
      ds.getRepository(Conversation),
      ds.getRepository(Message),
      registry,
      messageService as unknown as MessageService,
    );
    session = await ds
      .getRepository(Session)
      .save(
        ds
          .getRepository(Session)
          .create({ name: 'shop', businessId: BIZ, engineType: EngineType.WHATSAPP_WEB_JS } as Partial<Session>),
      );
    engines.set(session.id, { sendTextMessage: jest.fn() });
  });

  afterEach(async () => {
    await ds.destroy();
  });

  const draft = (content: Record<string, unknown>, kind: StudioMessage['kind'] = 'text') =>
    service.create(BIZ, { name: 'Welcome', kind, content }, session);

  it('saves a draft and reopens it with the same content', async () => {
    const saved = await draft({ text: 'Hello {{name}}', url: 'https://shop.example.com', junk: 'x' });
    expect(saved.status).toBe(StudioMessageStatus.DRAFT);
    expect(saved.readiness).toBe('ready');
    const reopened = await service.get(BIZ, saved.id);
    expect(reopened.content).toEqual({ text: 'Hello {{name}}', url: 'https://shop.example.com' });
    expect(reopened.usedIn).toEqual([]);
  });

  it('never shows another business its messages', async () => {
    const saved = await draft({ text: 'Hi' });
    await expect(service.get('other-biz', saved.id)).rejects.toThrow('Message not found');
    expect(await service.list('other-biz', {})).toEqual([]);
  });

  it('refuses a session of another business', async () => {
    const other = await ds
      .getRepository(Session)
      .save(ds.getRepository(Session).create({ name: 'other', businessId: 'biz-2' } as Partial<Session>));
    await expect(service.requireSession(BIZ, other.id, 'default')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.requireSession(BIZ, session.id, 'default')).resolves.toMatchObject({ id: session.id });
  });

  it('publishes only a ready message, and an edit that breaks it goes back to draft', async () => {
    const empty = await draft({ text: '' });
    await expect(service.publish(BIZ, empty.id, session)).rejects.toBeInstanceOf(BadRequestException);

    const ok = await draft({ text: 'Hi' });
    expect((await service.publish(BIZ, ok.id, session)).status).toBe(StudioMessageStatus.READY);
    const broken = await service.update(BIZ, ok.id, { content: { text: '' } }, session);
    expect(broken.status).toBe(StudioMessageStatus.DRAFT);
    expect(broken.readiness).toBe('needs_attention');
  });

  it('duplicates and lists recently used', async () => {
    const saved = await draft({ text: 'Hi' });
    const copy = await service.duplicate(BIZ, saved.id);
    expect(copy.name).toBe('Welcome (copy)');
    expect(copy.id).not.toBe(saved.id);
    await service.testSend(BIZ, saved.id, session, '+91 98765 43210');
    const recent = await service.list(BIZ, { sort: 'recent' });
    expect(recent.map(m => m.id)).toEqual([saved.id]);
  });

  it('sends a test through MessageService and records it as submitted, not delivered', async () => {
    const saved = await draft({ text: 'Hi there' });
    const result = await service.testSend(BIZ, saved.id, session, '+91 98765 43210');
    expect(messageService.sendText).toHaveBeenCalledWith(session.id, { chatId: '919876543210@c.us', text: 'Hi there' });
    expect(result.parts).toEqual([{ type: 'text', status: 'submitted', messageId: 'wamid.1' }]);
    expect(result.recipient).toBe('+91••••210');
    const status = await service.testStatus(BIZ, saved.id);
    expect(status.lastTest?.parts[0].status).toBe('submitted');
    expect(status.statuses).toEqual({});
  });

  it('refuses a test that is not ready, to an opted-out contact, or from an offline number', async () => {
    const notReady = await draft({ text: '' });
    await expect(service.testSend(BIZ, notReady.id, session, '919876543210')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const ok = await draft({ text: 'Hi' });
    await ds.getRepository(ContactConsent).save(
      ds.getRepository(ContactConsent).create({
        businessId: BIZ,
        waContactId: '919876543210@c.us',
        channel: 'whatsapp',
        status: ConsentStatus.OPTED_OUT,
      }),
    );
    await expect(service.testSend(BIZ, ok.id, session, '919876543210')).rejects.toBeInstanceOf(ForbiddenException);

    engines.delete(session.id);
    await expect(service.testSend(BIZ, ok.id, session, '919811111111')).rejects.toThrow('not connected');
    expect(messageService.sendText).not.toHaveBeenCalled();
  });

  it('records a failed part and stops there', async () => {
    const p = await service.createProduct(BIZ, {
      name: 'Kurta',
      price: 499,
      imageUrl: 'https://cdn.example.com/k.jpg',
    });
    const saved = await draft({ text: 'Our picks', products: [{ productId: p.id }, { productId: p.id }] }, 'products');
    expect(saved.readiness).toBe('needs_attention'); // the same product twice
    await service.update(BIZ, saved.id, { content: { text: 'Our picks', products: [{ productId: p.id }] } }, session);
    messageService.sendImage.mockRejectedValueOnce(new Error('media download failed'));
    const result = await service.testSend(BIZ, saved.id, session, '919876543210');
    expect(result.parts).toEqual([
      { type: 'text', status: 'submitted', messageId: 'wamid.1' },
      { type: 'media', status: 'failed', error: 'media download failed' },
    ]);
  });

  it('uses the stored product price, never one from the content', async () => {
    const p = await service.createProduct(BIZ, { name: 'Kurta', price: 499, currency: 'INR' });
    const saved = await draft({ products: [{ productId: p.id, price: 1 }] }, 'products');
    await service.testSend(BIZ, saved.id, session, '919876543210');
    expect(messageService.sendText).toHaveBeenCalledWith(session.id, {
      chatId: '919876543210@c.us',
      text: '*Kurta*\n₹499',
    });
  });

  it('searches products by name or SKU, hides archived ones, and refuses http links', async () => {
    await service.createProduct(BIZ, { name: 'Cotton Kurta', sku: 'KUR-1', price: 499, category: 'Clothing' });
    const scarf = await service.createProduct(BIZ, {
      name: 'Silk Scarf',
      sku: 'SCF-1',
      price: 299,
      category: 'Accessories',
    });
    await service.createProduct('biz-2', { name: 'Not mine', price: 1 });
    expect((await service.listProducts(BIZ, { search: 'kur' })).items.map(p => p.name)).toEqual(['Cotton Kurta']);
    expect((await service.listProducts(BIZ, { search: 'scf' })).items.map(p => p.name)).toEqual(['Silk Scarf']);
    await service.updateProduct(BIZ, scarf.id, { archived: true });
    const all = await service.listProducts(BIZ, {});
    expect(all.total).toBe(1);
    expect(all.categories).toEqual(['Clothing']);
    await expect(service.createProduct(BIZ, { name: 'X', price: 1, imageUrl: 'http://insecure' })).rejects.toThrow(
      'https://',
    );
    // Empty form inputs arrive as null and clear the field.
    const cleared = await service.updateProduct(BIZ, scarf.id, { sku: null, description: null } as never);
    expect(cleared.sku).toBeNull();
    const fromForm = await service.createProduct(BIZ, { name: 'Shawl', price: 1, sku: null, imageUrl: null } as never);
    expect(fromForm).toMatchObject({ sku: null, imageUrl: null });
  });

  it('finds the automations that use a message and guards archiving a live one', async () => {
    const saved = await draft({ text: 'Hi' });
    const repo = ds.getRepository(WorkflowDefinition);
    await repo.save(
      repo.create({
        businessId: BIZ,
        name: 'Welcome flow',
        slug: 'welcome-flow',
        status: WorkflowStatus.PUBLISHED,
        definition: {
          trigger: { type: 'message_received', config: {} },
          conditions: [],
          actions: [],
          nodes: [{ id: 'n1', type: STUDIO_NODE_TYPE, data: { config: { studioMessageId: saved.id } } }],
          edges: [],
        },
      } as unknown as WorkflowDefinition),
    );
    expect((await service.get(BIZ, saved.id)).usedIn).toEqual([
      expect.objectContaining({ name: 'Welcome flow', status: 'published' }),
    ]);
    await expect(service.archive(BIZ, saved.id)).rejects.toBeInstanceOf(ConflictException);
    expect((await service.archive(BIZ, saved.id, true)).status).toBe(StudioMessageStatus.ARCHIVED);
    expect((await service.restore(BIZ, saved.id)).status).toBe(StudioMessageStatus.DRAFT);
  });

  describe('sendForWorkflow', () => {
    it('refuses a draft', async () => {
      const saved = await draft({ text: 'Hi' });
      await expect(
        service.sendForWorkflow({ businessId: BIZ, messageId: saved.id, sessionId: session.id, chatId: '91999@c.us' }),
      ).rejects.toThrow('not published');
    });

    it('sends a published button message as a numbered menu and returns the choices', async () => {
      const saved = await service.create(
        BIZ,
        {
          name: 'Menu',
          kind: 'buttons',
          content: {
            text: 'Hi {{name}}, how can we help?',
            buttons: [
              { id: 'order', label: 'Track order', action: 'quick_reply' },
              { id: 'h', label: 'Talk to us', action: 'talk_to_human' },
            ],
          },
        },
        session,
      );
      await service.publish(BIZ, saved.id, session);
      const res = await service.sendForWorkflow({
        businessId: BIZ,
        messageId: saved.id,
        sessionId: session.id,
        chatId: '91999@c.us',
        fill: t => t.replace('{{name}}', 'Asha'),
      });
      expect(res.choices).toEqual([
        { id: 'order', text: 'Track order' },
        { id: 'talk_to_human', text: 'Talk to us' },
      ]);
      expect((messageService.sendText.mock.calls[0] as [string, { text: string }])[1].text).toContain(
        'Hi Asha, how can we help?',
      );
      expect((await service.publishedForWorkflows(BIZ)).map(m => m.choices.length)).toEqual([2]);
    });

    it('sends interactive buttons natively on a Cloud API number', async () => {
      const sendInteractiveMessage = jest.fn().mockResolvedValue({ id: 'wamid.cloud', timestamp: 1 });
      engines.set(session.id, { sendInteractiveMessage });
      const saved = await service.create(
        BIZ,
        {
          name: 'Menu',
          kind: 'buttons',
          content: { text: 'Pick', buttons: [{ id: 'yes', label: 'Yes', action: 'quick_reply' }] },
        },
        session,
      );
      await service.publish(BIZ, saved.id, session);
      const res = await service.sendForWorkflow({
        businessId: BIZ,
        messageId: saved.id,
        sessionId: session.id,
        chatId: '91999@c.us',
      });
      expect(sendInteractiveMessage).toHaveBeenCalledWith(
        '91999@c.us',
        expect.objectContaining({ type: 'button', body: { text: 'Pick' } }),
      );
      expect(res.parts).toEqual([{ type: 'interactive', status: 'submitted', messageId: 'wamid.cloud' }]);
    });
  });

  it('reads Meta templates into what the composer needs', () => {
    const info = toTemplateInfo({
      name: 'promo',
      language: 'en_US',
      status: 'approved',
      category: 'MARKETING',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hi {{1}}, {{2}} off today' },
        { type: 'FOOTER', text: 'Reply STOP to opt out' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Shop' }] },
      ],
    });
    expect(info).toMatchObject({
      status: 'APPROVED',
      bodyVariableCount: 2,
      headerFormat: 'IMAGE',
      footerText: 'Reply STOP to opt out',
      buttons: [{ type: 'URL', text: 'Shop' }],
      isCarousel: false,
    });
  });

  it('templates explain why they are unavailable on a non-Cloud number', async () => {
    expect(await service.templates(session.id)).toEqual({
      templates: null,
      reason: 'Approved templates are only available on WhatsApp Cloud API numbers.',
    });
  });

  it('saves the catalog id and reports it in capabilities', async () => {
    expect((await service.capabilities(BIZ, session)).catalogConfigured).toBe(false);
    await service.updateSettings(BIZ, { metaCatalogId: '1234567890' });
    expect(await service.capabilities(BIZ, session)).toMatchObject({
      catalogConfigured: true,
      cloudApi: false,
      connected: true,
    });
  });
});

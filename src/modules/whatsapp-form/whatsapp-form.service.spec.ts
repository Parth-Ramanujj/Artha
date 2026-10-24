import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { WhatsAppFormService } from './whatsapp-form.service';
import { formIdFromToken, type FormDefinition } from './flow-definition';
import type { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';

const definition: FormDefinition = {
  screens: [
    {
      id: 's1',
      title: 'Contact',
      components: [{ id: 'f', type: 'short_text', name: 'name', label: 'Name', required: true }],
    },
  ],
};

/** In-memory stand-in for a TypeORM repository; `unique` names a column that must not repeat. */
function fakeRepo(unique?: string) {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    create: (x: Record<string, unknown>) => ({ ...x }),
    save: (x: Record<string, unknown>) => {
      if (unique && [...rows.values()].some(r => r[unique] === x[unique] && r.id !== x.id)) {
        return Promise.reject(
          Object.assign(new Error('UNIQUE constraint failed'), { code: 'SQLITE_CONSTRAINT_UNIQUE' }),
        );
      }
      const row = { id: (x.id as string) ?? randomUUID(), ...x };
      rows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    find: () => Promise.resolve([...rows.values()]),
    findOne: ({ where }: { where: { id: string } }) =>
      Promise.resolve(rows.has(where.id) ? { ...rows.get(where.id)! } : null),
    remove: (x: { id: string }) => Promise.resolve(rows.delete(x.id)),
  };
}

function setup(opts: { reject?: string[]; sessionBusiness?: string } = {}) {
  const forms = fakeRepo();
  const submissions = fakeRepo('messageId');
  const sessions = { findOne: () => Promise.resolve({ id: 'sess', businessId: opts.sessionBusiness ?? 'biz' }) };
  const engine = {
    createFlow: jest.fn(() => Promise.resolve('meta-1')),
    uploadFlowJson: jest.fn(() => Promise.resolve((opts.reject ?? []).map(message => ({ message })))),
    publishFlow: jest.fn(() => Promise.resolve(undefined)),
    sendInteractiveMessage: jest.fn(() => Promise.resolve({ id: 'wamid.1' })),
  };
  const engines = { get: jest.fn(() => engine) };
  const businessService = { getOrCreateDefaultBusiness: () => Promise.resolve({ id: 'biz' }) };
  const hookManager = { register: jest.fn(() => 'hook-1'), unregister: jest.fn() };
  const service = new WhatsAppFormService(
    forms as never,
    submissions as never,
    sessions as never,
    engines as never,
    businessService as never,
    hookManager as never,
  );
  return { service, engine, forms, submissions, hookManager };
}

const submission = (flowToken: string, id = 'wamid.reply'): IncomingMessage =>
  ({
    id,
    chatId: '919876543210@c.us',
    fromMe: false,
    body: 'name: Asha',
    flowReply: { flowToken, answers: { name: 'Asha' } },
  }) as unknown as IncomingMessage;

describe('WhatsAppFormService', () => {
  it('publishes a valid form and marks it published', async () => {
    const { service, engine } = setup();
    const form = await service.create('biz', {
      name: 'Lead',
      definition: definition as unknown as Record<string, unknown>,
    });

    const result = await service.publish('biz', form.id, 'sess');

    expect(result).toEqual({ published: true, metaFlowId: 'meta-1', errors: [] });
    expect(engine.publishFlow).toHaveBeenCalledWith('meta-1');
    const saved = await service.get('biz', form.id);
    expect(saved.status).toBe('published');
    expect(saved.publishedAt).toBeInstanceOf(Date);
  });

  it('keeps the form as a draft when Meta rejects the flow JSON', async () => {
    const { service, engine } = setup({ reject: ['Missing footer'] });
    const form = await service.create('biz', {
      name: 'Lead',
      definition: definition as unknown as Record<string, unknown>,
    });

    const result = await service.publish('biz', form.id, 'sess');

    expect(result).toEqual({ published: false, metaFlowId: 'meta-1', errors: ['Missing footer'] });
    expect(engine.publishFlow).not.toHaveBeenCalled();
    expect((await service.get('biz', form.id)).status).toBe('draft');
  });

  it('refuses to publish an incomplete definition before calling Meta', async () => {
    const { service, engine } = setup();
    const form = await service.create('biz', {
      name: 'Empty',
      definition: { screens: [{ id: 's', title: '', components: [] }] },
    });

    await expect(service.publish('biz', form.id, 'sess')).rejects.toBeInstanceOf(BadRequestException);
    expect(engine.createFlow).not.toHaveBeenCalled();
  });

  it('creates a new Meta flow when a published form is republished', async () => {
    const { service, engine } = setup();
    const form = await service.create('biz', {
      name: 'Lead',
      definition: definition as unknown as Record<string, unknown>,
    });
    await service.publish('biz', form.id, 'sess');
    await service.update('biz', form.id, { name: 'Lead v2' });

    engine.createFlow.mockResolvedValueOnce('meta-2');
    const result = await service.publish('biz', form.id, 'sess');

    expect(result.metaFlowId).toBe('meta-2');
    expect(engine.createFlow).toHaveBeenCalledTimes(2);
  });

  it('sends only published forms, to a normalised chat id', async () => {
    const { service, engine } = setup();
    const form = await service.create('biz', {
      name: 'Lead',
      definition: definition as unknown as Record<string, unknown>,
    });

    await expect(service.send('biz', form.id, { sessionId: 'sess', phone: '+91 98765 43210' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await service.publish('biz', form.id, 'sess');
    const sent = await service.send('biz', form.id, { sessionId: 'sess', phone: '+91 98765 43210' });

    expect(sent).toEqual({ messageId: 'wamid.1' });
    const [chatId, message] = engine.sendInteractiveMessage.mock.calls[0] as unknown as [string, { type: string }];
    expect(chatId).toBe('919876543210@c.us');
    expect(message.type).toBe('flow');
  });

  it('sends into a workflow chat with a token that names the form', async () => {
    const { service } = setup();
    const form = await service.create('biz', {
      name: 'Lead',
      definition: definition as unknown as Record<string, unknown>,
    });
    await service.publish('biz', form.id, 'sess');

    const sent = await service.sendForWorkflow({
      businessId: 'biz',
      formId: form.id,
      sessionId: 'sess',
      chatId: 'c@c.us',
    });

    expect(sent.formName).toBe('Lead');
    expect(formIdFromToken(sent.flowToken)).toBe(form.id);
  });

  it('records a submission once, even when Meta redelivers the webhook', async () => {
    const { service, submissions } = setup();
    const form = await service.create('biz', {
      name: 'Lead',
      definition: definition as unknown as Record<string, unknown>,
    });
    const token = `${form.id}.nonce`;

    const saved = await service.recordSubmission('sess', submission(token));
    expect(saved).toMatchObject({ formId: form.id, businessId: 'biz', answers: { name: 'Asha' } });

    await expect(service.recordSubmission('sess', submission(token))).resolves.toBeNull();
    expect(submissions.rows.size).toBe(1);
    await expect(service.listSubmissions('biz', form.id)).resolves.toHaveLength(1);
  });

  it('ignores a submission from another business number or with a foreign token', async () => {
    const { service, submissions } = setup({ sessionBusiness: 'other-biz' });
    const form = await service.create('biz', {
      name: 'Lead',
      definition: definition as unknown as Record<string, unknown>,
    });

    await expect(service.recordSubmission('sess', submission(`${form.id}.nonce`))).resolves.toBeNull();
    await expect(service.recordSubmission('sess', submission('not-ours', 'wamid.2'))).resolves.toBeNull();
    expect(submissions.rows.size).toBe(0);
  });

  it('listens for submissions on incoming messages', () => {
    const { service, hookManager } = setup();
    service.onModuleInit();
    expect(hookManager.register).toHaveBeenCalledWith(
      'whatsapp-form-submissions',
      'message:received',
      expect.any(Function),
      expect.any(Number),
    );
    service.onModuleDestroy();
    expect(hookManager.unregister).toHaveBeenCalledWith('hook-1');
  });
});

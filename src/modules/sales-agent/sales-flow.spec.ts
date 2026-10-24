import { randomUUID } from 'crypto';
import { SalesReplyHandlerService } from './reply-handler.service';
import { SalesSenderService } from './sender.service';
import { defaultConfig } from './sales-agent.service';
import type { SalesAgentConfig } from './entities/sales-agent.entity';
import type { SalesChannel } from './channels/sales-channel';

type Row = Record<string, unknown>;

/** Matches a TypeORM `where` with plain values and the few FindOperators the services use. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    const op = cond as { _type?: string; _value?: unknown };
    if (op && typeof op === 'object' && op._type) {
      const val = op._value as never;
      switch (op._type) {
        case 'in':
          return (val as unknown[]).includes(v);
        case 'not':
          return v !== val;
        case 'lessThan':
          return (v as Date) < val;
        case 'lessThanOrEqual':
          return (v as Date) <= val;
        case 'moreThanOrEqual':
          return (v as Date) >= val;
      }
    }
    return v === cond;
  });
}

function fakeRepo() {
  const rows = new Map<string, Row>();
  const all = (where?: Row) => [...rows.values()].filter(r => !where || matches(r, where));
  return {
    rows,
    create: (x: Row) => ({ ...x }),
    save: (x: Row | Row[]) => {
      const list = (Array.isArray(x) ? x : [x]).map(r => {
        const row = { id: (r.id as string) ?? randomUUID(), error: '', approvedBy: '', ...r, updatedAt: new Date() };
        rows.set(row.id, row);
        return { ...row };
      });
      return Promise.resolve(Array.isArray(x) ? list : list[0]);
    },
    find: (o: { where?: Row } = {}) => Promise.resolve(all(o.where).map(r => ({ ...r }))),
    findOne: (o: { where: Row }) => Promise.resolve(all(o.where)[0] ? { ...all(o.where)[0] } : null),
    count: (o: { where?: Row } = {}) => Promise.resolve(all(o.where).length),
    update: (where: string | Row, patch: Row) => {
      const hit = typeof where === 'string' ? all({ id: where }) : all(where);
      hit.forEach(r => Object.assign(r, patch, { updatedAt: new Date() }));
      return Promise.resolve({ affected: hit.length });
    },
  };
}

function config(overrides: Partial<SalesAgentConfig> = {}): SalesAgentConfig {
  return {
    ...(defaultConfig('biz') as SalesAgentConfig),
    id: 'cfg',
    whatsapp: {
      enabled: true,
      sessionId: 's1',
      maxDailySends: 2,
      optOutLine: 'Reply STOP to opt out.',
      defaultCountryCode: '91',
    },
    ...overrides,
  };
}

function setup(aiAnswers: string[] = []) {
  const prospects = fakeRepo();
  const conversations = fakeRepo();
  const outbox = fakeRepo();
  const activity = fakeRepo();
  const ai = { complete: jest.fn(() => Promise.resolve({ content: aiAnswers.shift() ?? '' })) };
  const writer = { systemPrompt: () => 'system' };
  const handler = new SalesReplyHandlerService(
    ai as never,
    writer as never,
    prospects as never,
    conversations as never,
    outbox as never,
    activity as never,
  );
  const sender = new SalesSenderService(outbox as never, prospects as never, conversations as never);
  sender.pause = () => Promise.resolve();
  const sent: Array<{ to: string; body: string }> = [];
  const channel: SalesChannel = {
    name: 'whatsapp',
    isReady: () => true,
    recipientFor: p => `${p.phone}@c.us`,
    dailyCap: c => c.whatsapp.maxDailySends,
    footer: c => c.whatsapp.optOutLine,
    send: (_c, msg) => {
      sent.push(msg);
      return Promise.resolve({ messageId: `m${sent.length}` });
    },
  };
  return { prospects, conversations, outbox, activity, ai, handler, sender, channel, sent };
}

async function seedProspect(repo: ReturnType<typeof fakeRepo>, status = 'contacted') {
  return (await repo.save({ businessId: 'biz', phone: '919876543210', email: '', status, channel: 'whatsapp' })) as {
    id: string;
  } & Row;
}

const due = new Date('2026-10-24T06:00:00Z');

describe('sales reply handling', () => {
  it('stops the sequence on any reply and drafts an answer for review', async () => {
    const t = setup(['interested', 'Happy to show you. Does Tuesday at 11 work?']);
    const p = await seedProspect(t.prospects);
    await t.outbox.save({ businessId: 'biz', prospectId: p.id, kind: 'sequence', step: 2, status: 'approved' });

    const outcome = await t.handler.handle(config(), p as never, 'whatsapp', {
      from: 'x',
      text: 'Tell me more',
      ref: 'w1',
    });

    expect(outcome).toBe('held');
    const rows = [...t.outbox.rows.values()];
    expect(rows.find(r => r.step === 2)?.status).toBe('cancelled');
    const reply = rows.find(r => r.kind === 'reply');
    expect(reply?.status).toBe('pending_review');
    expect(reply?.body).toContain('Tuesday');
    expect(t.prospects.rows.get(p.id)?.status).toBe('replied');
  });

  it('opts out on STOP without asking the model and tells the channel', async () => {
    const t = setup();
    const p = await seedProspect(t.prospects);
    const onOptOut = jest.fn(() => Promise.resolve());

    expect(
      await t.handler.handle(config(), p as never, 'whatsapp', { from: 'x', text: 'STOP', ref: 'w1' }, onOptOut),
    ).toBe('opted_out');
    expect(t.ai.complete).not.toHaveBeenCalled();
    expect(onOptOut).toHaveBeenCalled();
    expect(t.prospects.rows.get(p.id)?.status).toBe('opted_out');
    expect([...t.outbox.rows.values()].some(r => r.kind === 'reply')).toBe(false);
  });

  it('handles a redelivered message once', async () => {
    const t = setup(['question', 'It costs 999 a month. Want a quick demo?', 'question', 'again']);
    const p = await seedProspect(t.prospects);
    const reply = { from: 'x', text: 'price?', ref: 'same' };
    await t.handler.handle(config(), p as never, 'whatsapp', reply);
    const again = await t.handler.handle(config(), { ...p, status: 'replied' } as never, 'whatsapp', reply);
    expect(again).toBe('duplicate');
  });
});

describe('sales sending', () => {
  it('sends approved messages with the opt-out footer, within the daily cap', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) {
      const p = await t.prospects.save({
        businessId: 'biz',
        phone: `91987654321${i}`,
        status: 'queued',
        channel: 'whatsapp',
      });
      await t.outbox.save({
        businessId: 'biz',
        prospectId: (p as Row).id,
        channel: 'whatsapp',
        kind: 'sequence',
        step: 1,
        subject: '',
        body: 'Hi there, quick question?',
        status: 'approved',
        approvedBy: 'you',
        sendAt: new Date('2026-10-24T05:00:00Z'),
      });
    }

    expect(await t.sender.drain(config(), [t.channel], due)).toBe(2);
    expect(t.sent[0].body).toBe('Hi there, quick question?\n\nReply STOP to opt out.');
    expect([...t.prospects.rows.values()].filter(p => p.status === 'contacted')).toHaveLength(2);
  });

  it('never sends while paused or to prospects who already replied', async () => {
    const t = setup();
    const p = await seedProspect(t.prospects, 'replied');
    await t.outbox.save({
      businessId: 'biz',
      prospectId: p.id,
      channel: 'whatsapp',
      kind: 'sequence',
      step: 1,
      subject: '',
      body: 'Hello?',
      status: 'approved',
      approvedBy: 'you',
      sendAt: new Date('2026-10-24T05:00:00Z'),
    });

    expect(await t.sender.drain(config({ sendingPaused: true }), [t.channel], due)).toBe(0);
    expect(await t.sender.drain(config(), [t.channel], due)).toBe(0);
    expect(t.sent).toHaveLength(0);
    expect([...t.outbox.rows.values()][0].status).toBe('cancelled');
  });

  it('holds autopilot messages that link to strange hosts', async () => {
    const t = setup();
    const p = await seedProspect(t.prospects);
    await t.outbox.save({
      businessId: 'biz',
      prospectId: p.id,
      channel: 'whatsapp',
      kind: 'reply',
      step: 0,
      subject: '',
      body: 'Pay here https://evil.test/pay',
      status: 'approved',
      approvedBy: 'autopilot',
      sendAt: new Date('2026-10-24T05:00:00Z'),
    });

    await t.sender.drain(config({ requireApproval: false }), [t.channel], due);
    expect(t.sent).toHaveLength(0);
    const row = [...t.outbox.rows.values()][0];
    expect(row.status).toBe('pending_review');
    expect(row.error).toMatch(/^held for your review/);
  });
});

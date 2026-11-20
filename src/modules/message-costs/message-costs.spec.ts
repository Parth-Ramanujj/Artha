import { DataSource } from 'typeorm';
import { buildCostSuggestions, estimateInr, type ChargeRow } from './message-cost-rules';
import { cloudAckDetails } from '../../engine/adapters/cloud-api.adapter';
import { AddMessageCharges1788800000000 } from '../../database/migrations/1788800000000-AddMessageCharges';
import { MessageCharge } from './entities/message-charge.entity';
import { MessageCostSetting } from './entities/message-cost-setting.entity';
import { MessageCostsService } from './message-costs.service';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-11-20T12:00:00Z').getTime();
const charge = (patch: Partial<ChargeRow>): ChargeRow => ({
  chatId: '91999@c.us',
  category: 'marketing',
  pricingType: 'regular',
  billable: true,
  status: 'delivered',
  errorCode: null,
  estimatedInr: 0.78,
  createdAt: new Date(now - HOUR),
  ...patch,
});

describe('message cost rules', () => {
  it('prices a message from what Meta reports', () => {
    expect(estimateInr('marketing', true)).toBe(0.78);
    expect(estimateInr('UTILITY', true)).toBe(0.12);
    expect(estimateInr('utility', false)).toBe(0);
    expect(estimateInr('service', true)).toBe(0);
    expect(estimateInr(null, true)).toBe(0);
  });

  it('spots a paid template sent while the free window was open', () => {
    const incoming = new Map([['91999@c.us', [now - 3 * HOUR]]]);
    const s = buildCostSuggestions([charge({})], incoming, now);
    expect(s.find(x => x.id === 'paid_in_window')).toMatchObject({ savingInr: 0.78 });
  });

  it('lists numbers that keep failing and people messaged too often or never replying', () => {
    const failed = [1, 2].map(() => charge({ chatId: '91111@c.us', status: 'failed', estimatedInr: 0 }));
    const spam = [1, 2, 3, 4, 5].map(i => charge({ chatId: '91222@c.us', createdAt: new Date(now - i * HOUR) }));
    const s = buildCostSuggestions([...failed, ...spam], new Map(), now);
    expect(s.find(x => x.id === 'failed_numbers')?.numbers).toEqual(['91111']);
    expect(s.find(x => x.id === 'too_frequent')).toMatchObject({ numbers: ['91222'], savingInr: 1.56 });
    expect(s.find(x => x.id === 'no_replies')?.numbers).toEqual(['91222']);
    expect(s.find(x => x.id === 'marketing_share')).toBeDefined();
  });

  it('gives no advice when nothing was paid', () => {
    expect(
      buildCostSuggestions([charge({ billable: false, estimatedInr: 0, category: 'service' })], new Map(), now),
    ).toEqual([]);
  });

  it("reads Meta's pricing block and error from a status webhook", () => {
    const toChat = (p: string) => `${p}@c.us`;
    expect(
      cloudAckDetails(
        {
          recipient_id: '91999',
          pricing: { billable: true, pricing_model: 'PMP', category: 'marketing', type: 'regular' },
          errors: [{ code: 131026, title: 'Undeliverable' }],
        },
        toChat,
      ),
    ).toEqual({
      chatId: '91999@c.us',
      billable: true,
      category: 'marketing',
      pricingType: 'regular',
      errorCode: 131026,
    });
    expect(cloudAckDetails({}, toChat)).toBeUndefined();
  });
});

describe('message costs storage', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [MessageCharge, MessageCostSetting],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddMessageCharges1788800000000().up(qr);
    await new AddMessageCharges1788800000000().up(qr); // idempotent
  });
  afterEach(() => ds.destroy());

  it('records a campaign send, then Meta pricing and delivery, and moves the campaign forward', async () => {
    const recipients = { update: jest.fn() };
    const campaigns = { increment: jest.fn() };
    const empty = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) };
    const service = new MessageCostsService(
      ds.getRepository(MessageCharge),
      ds.getRepository(MessageCostSetting),
      empty as never,
      empty as never,
      campaigns as never,
      recipients as never,
      { insert: jest.fn() } as never,
    );

    await service.recordSend({
      sessionId: 's1',
      waMessageId: 'w1',
      chatId: '91999@c.us',
      campaignId: 'c1',
      source: 'campaign',
    });
    await service.recordStatus('s1', 'w1', 'sent', '91999@c.us', {
      billable: true,
      category: 'marketing',
      type: 'regular',
    });
    await service.recordStatus('s1', 'w1', 'delivered', '91999@c.us', {});
    await service.recordStatus('s1', 'w1', 'delivered', '91999@c.us', {}); // repeat webhook: no double count

    const row = await ds.getRepository(MessageCharge).findOneByOrFail({ waMessageId: 'w1' });
    expect(row).toMatchObject({
      status: 'delivered',
      category: 'marketing',
      billable: true,
      estimatedInr: 0.78,
      campaignId: 'c1',
    });
    expect(campaigns.increment).toHaveBeenCalledTimes(1);
    expect(campaigns.increment).toHaveBeenCalledWith({ id: 'c1' }, 'deliveredCount', 1);
    expect(recipients.update).toHaveBeenCalledWith(
      { campaignId: 'c1', chatId: '91999@c.us' },
      expect.objectContaining({ status: 'delivered' }),
    );

    // An ack with no pricing for a message we never saw (e.g. another engine) is ignored.
    await service.recordStatus('s1', 'other', 'delivered', undefined, {});
    expect(await ds.getRepository(MessageCharge).count()).toBe(1);
  });
});

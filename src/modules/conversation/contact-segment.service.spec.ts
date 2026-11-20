import { DataSource } from 'typeorm';
import { ContactSegment } from './entities/contact-segment.entity';
import { Contact } from './entities/contact.entity';
import { ContactSegmentService } from './contact-segment.service';

describe('ContactSegmentService tag segments', () => {
  let ds: DataSource;
  let svc: ContactSegmentService;
  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [ContactSegment, Contact],
      synchronize: true,
    });
    await ds.initialize();
    svc = new ContactSegmentService(ds.getRepository(ContactSegment), ds.getRepository(Contact));
    const contacts = ds.getRepository(Contact);
    const add = (waContactId: string, tags: string[], businessId = 'b1') =>
      contacts.save(contacts.create({ businessId, waContactId, tags }));
    await add('1', ['Insurance']);
    await add('2', ['mediclaim', 'vip']);
    await add('3', ['plan']); // must not match "term_plan"
    await add('4', ['insurance'], 'b2'); // another business
  });
  afterAll(() => ds.destroy());

  it('counts contacts with ANY of the tags, case-insensitive, whole tags only, own business only', async () => {
    const seg = await svc.create('b1', {
      name: 'Insurance Inquiries',
      type: 'dynamic',
      filters: { tags: ['insurance', 'term_plan', 'mediclaim'] },
    });
    expect(seg.contactCount).toBe(2);
    const people = await svc.getContacts(seg.id, 'b1');
    expect(people.map(c => c.waContactId).sort()).toEqual(['1', '2']);
  });
});

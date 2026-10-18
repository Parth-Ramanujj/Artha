import { DataSource } from 'typeorm';
import { AddWorkflowAgentsAndLeads1786600000000 } from '../1786600000000-AddWorkflowAgentsAndLeads';
import { AddMissingLeadColumns1787200000000 } from '../1787200000000-AddMissingLeadColumns';
import { AddLeadClassification1787300000000 } from '../1787300000000-AddLeadClassification';
import { Lead, LeadStatus } from '../../../modules/workflow/entities/lead.entity';

describe('AddMissingLeadColumns migration', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [Lead], synchronize: false });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    await new AddWorkflowAgentsAndLeads1786600000000().up(runner);
    await runner.release();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('lets the Lead entity be saved and read on a table built by the original migrations', async () => {
    const runner = ds.createQueryRunner();
    await new AddMissingLeadColumns1787200000000().up(runner);
    await new AddLeadClassification1787300000000().up(runner);
    await expect(new AddLeadClassification1787300000000().up(runner)).resolves.toBeUndefined();
    await runner.release();

    const repo = ds.getRepository(Lead);
    await repo.save(
      repo.create({
        leadNumber: 'LD-WA-TEST',
        businessId: 'biz',
        chatId: '911111111111@c.us',
        customerPhone: '911111111111',
        mainService: 'general',
        selectedService: 'whatsapp_enquiry',
        pincode: '',
        status: LeadStatus.NEW,
        metadata: { source: 'whatsapp_inbound' },
        contactedAt: new Date('2026-10-18T05:00:00Z'),
      }),
    );

    const [lead] = await repo.find();
    expect(lead.metadata).toEqual({ source: 'whatsapp_inbound' });
    expect(lead.contactedAt).toEqual(new Date('2026-10-18T05:00:00Z'));
  });

  it('is safe to run twice and can be rolled back', async () => {
    const runner = ds.createQueryRunner();
    const migration = new AddMissingLeadColumns1787200000000();
    await migration.up(runner);
    await expect(migration.up(runner)).resolves.toBeUndefined();

    await migration.down(runner);
    expect(await runner.hasColumn('workflow_leads', 'workflowId')).toBe(false);
    expect(await runner.hasColumn('workflow_leads', 'customerPhone')).toBe(true);
    await runner.release();
  });
});

import { MigrationInterface, QueryRunner, TableColumnOptions, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

const id = (): TableColumnOptions => ({
  name: 'id',
  type: 'varchar',
  length: '36',
  isPrimary: true,
  isGenerated: true,
  generationStrategy: 'uuid',
});
const str = (name: string, length: number, nullable = false): TableColumnOptions =>
  nullable
    ? { name, type: 'varchar', length: String(length), isNullable: true }
    : { name, type: 'varchar', length: String(length), default: "''" };
const text = (name: string): TableColumnOptions => ({ name, type: 'text', default: "''" });
const json = (name: string): TableColumnOptions => ({ name, type: 'text' });
const date = (name: string, nullable = true): TableColumnOptions => ({ name, type: 'datetime', isNullable: nullable });
const createdAt: TableColumnOptions = { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const updatedAt: TableColumnOptions = { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const businessId: TableColumnOptions = { name: 'businessId', type: 'varchar', length: '36' };

/** Sales agent (Harvey port): config, companies, prospects, outbox, conversations, activity. */
export class AddSalesAgent1788000000000 implements MigrationInterface {
  name = 'AddSalesAgent1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('sales_agent_configs')) return;

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'sales_agent_configs',
        columns: [
          id(),
          businessId,
          { name: 'enabled', type: 'boolean', default: false },
          { name: 'requireApproval', type: 'boolean', default: true },
          { name: 'sendingPaused', type: 'boolean', default: false },
          json('persona'),
          json('product'),
          json('icp'),
          json('whatsapp'),
          json('email'),
          json('schedule'),
          date('lastCycleAt'),
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'sales_agent_configs',
      new TableIndex({ columnNames: ['businessId'], isUnique: true }),
    );

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'sales_agent_companies',
        columns: [
          id(),
          businessId,
          { name: 'name', type: 'varchar', length: '200' },
          str('domain', 200),
          str('website', 300),
          str('phone', 40),
          str('industry', 100),
          str('location', 200),
          str('externalId', 100),
          json('signals'),
          date('profiledAt'),
          createdAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('sales_agent_companies', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'sales_agent_prospects',
        columns: [
          id(),
          businessId,
          str('companyId', 36, true),
          str('name', 200),
          str('companyName', 200),
          str('title', 120),
          str('phone', 20),
          str('email', 200),
          str('channel', 20, true),
          { name: 'status', type: 'varchar', length: '20', default: "'new'" },
          text('notes'),
          { name: 'source', type: 'varchar', length: '40', default: "'manual'" },
          { name: 'writeAttempts', type: 'integer', default: 0 },
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('sales_agent_prospects', new TableIndex({ columnNames: ['businessId', 'status'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'sales_agent_outbox',
        columns: [
          id(),
          businessId,
          { name: 'prospectId', type: 'varchar', length: '36' },
          { name: 'channel', type: 'varchar', length: '20' },
          { name: 'kind', type: 'varchar', length: '20', default: "'sequence'" },
          { name: 'step', type: 'integer', default: 1 },
          str('subject', 200),
          { name: 'body', type: 'text' },
          { name: 'status', type: 'varchar', length: '20' },
          date('sendAt', false),
          date('sentAt'),
          str('providerMessageId', 300),
          str('inReplyTo', 300),
          text('error'),
          str('approvedBy', 20),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('sales_agent_outbox', new TableIndex({ columnNames: ['businessId', 'status'] }));
    await queryRunner.createIndex('sales_agent_outbox', new TableIndex({ columnNames: ['prospectId'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'sales_agent_conversations',
        columns: [
          id(),
          businessId,
          { name: 'prospectId', type: 'varchar', length: '36' },
          { name: 'channel', type: 'varchar', length: '20' },
          json('thread'),
          str('intent', 30),
          { name: 'stage', type: 'varchar', length: '30', default: "'initial_outreach'" },
          { name: 'status', type: 'varchar', length: '20', default: "'open'" },
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'sales_agent_conversations',
      new TableIndex({ columnNames: ['prospectId'], isUnique: true }),
    );
    await queryRunner.createIndex(
      'sales_agent_conversations',
      new TableIndex({ columnNames: ['businessId', 'status'] }),
    );

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'sales_agent_activity',
        columns: [id(), businessId, { name: 'type', type: 'varchar', length: '40' }, json('details'), createdAt],
      }),
      true,
    );
    await queryRunner.createIndex('sales_agent_activity', new TableIndex({ columnNames: ['businessId', 'createdAt'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'sales_agent_activity',
      'sales_agent_conversations',
      'sales_agent_outbox',
      'sales_agent_prospects',
      'sales_agent_companies',
      'sales_agent_configs',
    ]) {
      await queryRunner.dropTable(table, true);
    }
  }
}

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
const text = (name: string, nullable = false): TableColumnOptions =>
  nullable ? { name, type: 'text', isNullable: true } : { name, type: 'text', default: "''" };
const json = (name: string): TableColumnOptions => ({ name, type: 'text' });
const int = (name: string): TableColumnOptions => ({ name, type: 'integer', default: 0 });
const bool = (name: string, value: boolean): TableColumnOptions => ({ name, type: 'boolean', default: value });
const date = (name: string): TableColumnOptions => ({ name, type: 'datetime', isNullable: true });
const createdAt: TableColumnOptions = { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const updatedAt: TableColumnOptions = { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const businessId: TableColumnOptions = { name: 'businessId', type: 'varchar', length: '36' };

/** Library: reusable posts, their posting automations and the delivery history. */
export class AddLibrary1788300000000 implements MigrationInterface {
  name = 'AddLibrary1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('library_items')) return;

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'library_items',
        columns: [
          id(),
          businessId,
          str('title', 200),
          str('category', 80),
          json('tags'),
          { name: 'type', type: 'varchar', length: '10', default: "'text'" },
          text('text'),
          str('mediaPath', 300, true),
          str('mediaMimetype', 100, true),
          int('useCount'),
          date('lastUsedAt'),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('library_items', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'library_automations',
        columns: [
          id(),
          businessId,
          str('name', 200),
          { name: 'sessionId', type: 'varchar', length: '36' },
          json('itemIds'),
          int('cursor'),
          bool('postToStatus', false),
          json('chatIds'),
          json('schedule'),
          bool('enabled', true),
          date('nextRunAt'),
          date('lastRunAt'),
          text('lastError', true),
          int('runCount'),
          str('createdBy', 36, true),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('library_automations', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex('library_automations', new TableIndex({ columnNames: ['nextRunAt'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'library_runs',
        columns: [
          id(),
          businessId,
          str('automationId', 36, true),
          str('itemId', 36, true),
          str('itemTitle', 200),
          { name: 'sessionId', type: 'varchar', length: '36' },
          bool('postedToStatus', false),
          int('sent'),
          int('failed'),
          int('skipped'),
          text('error', true),
          createdAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('library_runs', new TableIndex({ columnNames: ['businessId', 'createdAt'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('library_runs', true);
    await queryRunner.dropTable('library_automations', true);
    await queryRunner.dropTable('library_items', true);
  }
}

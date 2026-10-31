import { MigrationInterface, QueryRunner, TableColumn, TableColumnOptions, TableIndex } from 'typeorm';
import { portableColumn, portableTable } from '../portable-table';

const id = (): TableColumnOptions => ({
  name: 'id',
  type: 'varchar',
  length: '36',
  isPrimary: true,
  isGenerated: true,
  generationStrategy: 'uuid',
});
const str = (name: string, length: number, value = ''): TableColumnOptions => ({
  name,
  type: 'varchar',
  length: String(length),
  default: `'${value}'`,
});
const nstr = (name: string, length: number): TableColumnOptions => ({
  name,
  type: 'varchar',
  length: String(length),
  isNullable: true,
});
const text = (name: string, nullable = false): TableColumnOptions =>
  nullable ? { name, type: 'text', isNullable: true } : { name, type: 'text', default: "''" };
const int = (name: string, value = 0): TableColumnOptions => ({ name, type: 'integer', default: value });
const bool = (name: string): TableColumnOptions => ({ name, type: 'boolean', default: false });
const date = (name: string): TableColumnOptions => ({ name, type: 'datetime', isNullable: true });
const createdAt: TableColumnOptions = { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const updatedAt: TableColumnOptions = { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const businessId: TableColumnOptions = { name: 'businessId', type: 'varchar', length: '36' };

/** Growth: click-to-chat links/QR, greetings, owner summary, voice actions; birthday/anniversary on contacts. */
export class AddGrowth1788400000000 implements MigrationInterface {
  name = 'AddGrowth1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['birthday', 'anniversary']) {
      if (!(await queryRunner.hasColumn('contacts', name))) {
        await queryRunner.addColumn(
          'contacts',
          new TableColumn(portableColumn(queryRunner, { name, type: 'varchar', length: '5', isNullable: true })),
        );
      }
    }
    if (await queryRunner.hasTable('growth_settings')) return;

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'growth_settings',
        columns: [
          id(),
          businessId,
          nstr('sessionId', 36),
          str('timezone', 60, 'Asia/Kolkata'),
          bool('summaryEnabled'),
          str('ownerPhone', 20),
          str('summaryTime', 5, '20:00'),
          date('summaryNextRunAt'),
          text('summaryLastError', true),
          bool('greetingsEnabled'),
          str('greetingTime', 5, '09:00'),
          date('greetingsNextRunAt'),
          text('birthdayText'),
          text('anniversaryText'),
          int('winbackDays'),
          text('winbackText'),
          int('dailySendCap', 50),
          text('greetingsLastError', true),
          bool('voiceActionsEnabled'),
          bool('autoStopEnabled'),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('growth_settings', new TableIndex({ columnNames: ['businessId'], isUnique: true }));
    await queryRunner.createIndex('growth_settings', new TableIndex({ columnNames: ['summaryNextRunAt'] }));
    await queryRunner.createIndex('growth_settings', new TableIndex({ columnNames: ['greetingsNextRunAt'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'growth_links',
        columns: [
          id(),
          businessId,
          str('name', 100),
          str('ref', 12),
          str('phone', 20),
          str('prefillText', 500),
          int('scans'),
          int('chats'),
          date('lastScanAt'),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('growth_links', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex('growth_links', new TableIndex({ columnNames: ['ref'], isUnique: true }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'growth_greeting_log',
        columns: [
          id(),
          businessId,
          str('chatId', 100),
          nstr('name', 200),
          str('kind', 20),
          str('periodKey', 40),
          str('status', 10, 'sent'),
          text('error', true),
          createdAt,
        ],
        uniques: [{ name: 'UQ_growth_greeting', columnNames: ['businessId', 'chatId', 'kind', 'periodKey'] }],
      }),
      true,
    );
    await queryRunner.createIndex('growth_greeting_log', new TableIndex({ columnNames: ['businessId', 'createdAt'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('growth_greeting_log', true);
    await queryRunner.dropTable('growth_links', true);
    await queryRunner.dropTable('growth_settings', true);
    for (const name of ['anniversary', 'birthday']) {
      if (await queryRunner.hasColumn('contacts', name)) await queryRunner.dropColumn('contacts', name);
    }
  }
}

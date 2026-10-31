import { MigrationInterface, QueryRunner, TableColumn, TableColumnOptions, TableIndex } from 'typeorm';
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
const text = (name: string): TableColumnOptions => ({ name, type: 'text', isNullable: true });
const date = (name: string): TableColumnOptions => ({ name, type: 'datetime', isNullable: true });
const createdAt: TableColumnOptions = { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const updatedAt: TableColumnOptions = { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const businessId: TableColumnOptions = { name: 'businessId', type: 'varchar', length: '36' };

/** Missed-call follow-up (WhatsApp, then an AI call) and the AI assistant chat links. */
export class AddCustomerCare1788500000000 implements MigrationInterface {
  name = 'AddCustomerCare1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('ai_calls', 'greeting'))) {
      await queryRunner.addColumns('ai_calls', [
        new TableColumn({ name: 'greeting', type: 'text', isNullable: true }),
        new TableColumn({ name: 'briefing', type: 'text', isNullable: true }),
      ]);
    }
    if (await queryRunner.hasTable('customer_care_settings')) return;

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'customer_care_settings',
        columns: [
          id(),
          businessId,
          str('ownerName', 120),
          { name: 'missedCall', type: 'text' },
          { name: 'assistant', type: 'text' },
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'customer_care_settings',
      new TableIndex({ columnNames: ['businessId'], isUnique: true }),
    );

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'missed_calls',
        columns: [
          id(),
          businessId,
          str('phone', 20),
          str('name', 120, true),
          { name: 'source', type: 'varchar', length: '20', default: "'phone'" },
          { name: 'status', type: 'varchar', length: '20', default: "'new'" },
          str('sessionId', 36, true),
          date('messagedAt'),
          date('callDueAt'),
          date('repliedAt'),
          str('aiCallId', 36, true),
          text('error'),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('missed_calls', new TableIndex({ columnNames: ['businessId', 'createdAt'] }));
    await queryRunner.createIndex('missed_calls', new TableIndex({ columnNames: ['status', 'callDueAt'] }));
    await queryRunner.createIndex('missed_calls', new TableIndex({ columnNames: ['phone'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'assistant_links',
        columns: [
          id(),
          str('token', 64),
          businessId,
          str('sessionId', 36),
          str('chatId', 120),
          str('phone', 20, true),
          { name: 'transcript', type: 'text' },
          date('expiresAt'),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('assistant_links', new TableIndex({ columnNames: ['token'], isUnique: true }));
    await queryRunner.createIndex('assistant_links', new TableIndex({ columnNames: ['sessionId', 'chatId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('assistant_links', true);
    await queryRunner.dropTable('missed_calls', true);
    await queryRunner.dropTable('customer_care_settings', true);
    if (await queryRunner.hasColumn('ai_calls', 'greeting')) {
      await queryRunner.dropColumns('ai_calls', ['greeting', 'briefing']);
    }
  }
}

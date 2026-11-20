import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

/** Message logs: every Cloud API send and webhook, kept 7 days for troubleshooting delivery. */
export class AddWhatsAppEvents1789100000000 implements MigrationInterface {
  name = 'AddWhatsAppEvents1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('whatsapp_events')) return;
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'whatsapp_events',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'sessionId', type: 'varchar', length: '64', isNullable: true },
          { name: 'kind', type: 'varchar', length: '40' },
          { name: 'level', type: 'varchar', length: '10', default: "'info'" },
          { name: 'waMessageId', type: 'varchar', length: '128', isNullable: true },
          { name: 'phone', type: 'varchar', length: '32', isNullable: true },
          { name: 'summary', type: 'varchar', length: '300' },
          { name: 'details', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'whatsapp_events',
      new TableIndex({ name: 'IDX_whatsapp_events_created', columnNames: ['createdAt'] }),
    );
    await queryRunner.createIndex(
      'whatsapp_events',
      new TableIndex({ name: 'IDX_whatsapp_events_session_created', columnNames: ['sessionId', 'createdAt'] }),
    );
    await queryRunner.createIndex('whatsapp_events', new TableIndex({ columnNames: ['waMessageId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('whatsapp_events')) await queryRunner.dropTable('whatsapp_events');
  }
}

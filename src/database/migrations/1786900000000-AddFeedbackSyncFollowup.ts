import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

export class AddFeedbackSyncFollowup1786900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'feedback',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'conversationId', type: 'varchar', length: '36' },
          { name: 'sessionId', type: 'varchar', length: '36', isNullable: true },
          { name: 'chatId', type: 'varchar', length: '100', isNullable: true },
          { name: 'customerName', type: 'varchar', length: '100', isNullable: true },
          { name: 'agentName', type: 'varchar', length: '100', isNullable: true },
          { name: 'rating', type: 'integer', default: 0 },
          { name: 'comment', type: 'text', isNullable: true },
          { name: 'tags', type: 'text', isNullable: true },
          { name: 'resolved', type: 'boolean', default: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('feedback', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'sync_configs',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'provider', type: 'varchar', length: '30' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'direction', type: 'varchar', length: '20', default: "'push'" },
          { name: 'status', type: 'varchar', length: '20', default: "'paused'" },
          { name: 'config', type: 'text', isNullable: true },
          { name: 'fieldMapping', type: 'text', isNullable: true },
          { name: 'dataType', type: 'varchar', length: '30', default: "'contacts'" },
          { name: 'syncedCount', type: 'integer', default: 0 },
          { name: 'errorCount', type: 'integer', default: 0 },
          { name: 'lastError', type: 'text', isNullable: true },
          { name: 'lastSyncAt', type: 'text', isNullable: true },
          { name: 'enabled', type: 'boolean', default: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('sync_configs', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'followup_rules',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'trigger', type: 'varchar', length: '30' },
          { name: 'delayMinutes', type: 'integer', default: 60 },
          { name: 'message', type: 'text' },
          { name: 'maxAttempts', type: 'integer', default: 3 },
          { name: 'cooldownMinutes', type: 'integer', default: 1440 },
          { name: 'conditions', type: 'text', isNullable: true },
          { name: 'sessionId', type: 'varchar', length: '36', isNullable: true },
          { name: 'enabled', type: 'boolean', default: true },
          { name: 'totalSent', type: 'integer', default: 0 },
          { name: 'totalRecovered', type: 'integer', default: 0 },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('followup_rules', new TableIndex({ columnNames: ['businessId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('followup_rules', true);
    await queryRunner.dropTable('sync_configs', true);
    await queryRunner.dropTable('feedback', true);
  }
}

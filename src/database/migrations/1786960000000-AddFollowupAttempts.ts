import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';
import { portableTable, portableColumn } from '../portable-table';

export class AddFollowupAttempts1786960000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'conversations',
      new TableColumn(portableColumn(queryRunner, { name: 'lastInboundAt', type: 'datetime', isNullable: true })),
    );

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'followup_attempts',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'ruleId', type: 'varchar', length: '36' },
          { name: 'conversationId', type: 'varchar', length: '36' },
          { name: 'sessionId', type: 'varchar', length: '36' },
          { name: 'chatId', type: 'varchar', length: '100' },
          { name: 'sentAt', type: 'datetime' },
          { name: 'recoveredAt', type: 'datetime', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('followup_attempts', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex('followup_attempts', new TableIndex({ columnNames: ['ruleId', 'conversationId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('followup_attempts', true);
    await queryRunner.dropColumn('conversations', 'lastInboundAt');
  }
}

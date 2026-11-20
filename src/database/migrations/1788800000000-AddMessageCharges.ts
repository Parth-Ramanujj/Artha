import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

/** Message cost tracking: Meta's per-message pricing from status webhooks, and a monthly budget. */
export class AddMessageCharges1788800000000 implements MigrationInterface {
  name = 'AddMessageCharges1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const id = {
      name: 'id',
      type: 'varchar',
      length: '36',
      isPrimary: true,
      isGenerated: true,
      generationStrategy: 'uuid' as const,
    };
    const now = { type: 'datetime', default: 'CURRENT_TIMESTAMP' };

    if (!(await queryRunner.hasTable('message_charges'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'message_charges',
          columns: [
            id,
            { name: 'sessionId', type: 'varchar', length: '64' },
            { name: 'waMessageId', type: 'varchar', length: '128' },
            { name: 'chatId', type: 'varchar', length: '200', isNullable: true },
            { name: 'campaignId', type: 'varchar', length: '36', isNullable: true },
            { name: 'source', type: 'varchar', length: '20', default: "'other'" },
            { name: 'category', type: 'varchar', length: '30', isNullable: true },
            { name: 'pricingType', type: 'varchar', length: '40', isNullable: true },
            { name: 'billable', type: 'boolean', isNullable: true },
            { name: 'status', type: 'varchar', length: '20', default: "'sent'" },
            { name: 'errorCode', type: 'integer', isNullable: true },
            { name: 'estimatedInr', type: 'float', default: 0 },
            { name: 'createdAt', ...now },
            { name: 'updatedAt', ...now },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'message_charges',
        new TableIndex({
          name: 'UQ_message_charges_session_wamid',
          columnNames: ['sessionId', 'waMessageId'],
          isUnique: true,
        }),
      );
      await queryRunner.createIndex(
        'message_charges',
        new TableIndex({ name: 'IDX_message_charges_session_created', columnNames: ['sessionId', 'createdAt'] }),
      );
      await queryRunner.createIndex('message_charges', new TableIndex({ columnNames: ['campaignId'] }));
    }

    if (!(await queryRunner.hasTable('message_cost_settings'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'message_cost_settings',
          columns: [
            id,
            { name: 'businessId', type: 'varchar', length: '36' },
            { name: 'monthlyBudgetInr', type: 'float', isNullable: true },
            { name: 'alertedMonth', type: 'varchar', length: '7', isNullable: true },
            { name: 'updatedAt', ...now },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'message_cost_settings',
        new TableIndex({ columnNames: ['businessId'], isUnique: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('message_cost_settings')) await queryRunner.dropTable('message_cost_settings');
    if (await queryRunner.hasTable('message_charges')) await queryRunner.dropTable('message_charges');
  }
}

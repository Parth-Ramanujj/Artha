import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

const id = {
  name: 'id',
  type: 'varchar',
  length: '36',
  isPrimary: true,
  isGenerated: true,
  generationStrategy: 'uuid' as const,
};
const createdAt = { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };

/** Click-to-WhatsApp ad leads, WhatsApp call log and GST invoices sent on WhatsApp. */
export class AddWaBusiness1789200000000 implements MigrationInterface {
  name = 'AddWaBusiness1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ad_referrals'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'ad_referrals',
          columns: [
            id,
            { name: 'sessionId', type: 'varchar', length: '64' },
            { name: 'phone', type: 'varchar', length: '32' },
            { name: 'customerName', type: 'varchar', length: '128', isNullable: true },
            { name: 'sourceType', type: 'varchar', length: '16' },
            { name: 'sourceId', type: 'varchar', length: '64', isNullable: true },
            { name: 'sourceUrl', type: 'varchar', length: '500', isNullable: true },
            { name: 'headline', type: 'varchar', length: '300', isNullable: true },
            { name: 'firstMessage', type: 'varchar', length: '300', isNullable: true },
            { name: 'ctwaClid', type: 'varchar', length: '256', isNullable: true },
            createdAt,
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'ad_referrals',
        new TableIndex({ name: 'IDX_ad_referrals_session_created', columnNames: ['sessionId', 'createdAt'] }),
      );
    }

    if (!(await queryRunner.hasTable('wa_calls'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'wa_calls',
          columns: [
            id,
            { name: 'sessionId', type: 'varchar', length: '64' },
            { name: 'callId', type: 'varchar', length: '191' },
            { name: 'phone', type: 'varchar', length: '32' },
            { name: 'direction', type: 'varchar', length: '24' },
            { name: 'status', type: 'varchar', length: '16' },
            { name: 'durationSec', type: 'int', default: 0 },
            createdAt,
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'wa_calls',
        new TableIndex({ name: 'IDX_wa_calls_session_created', columnNames: ['sessionId', 'createdAt'] }),
      );
      await queryRunner.createIndex('wa_calls', new TableIndex({ columnNames: ['callId'], isUnique: true }));
    }

    if (!(await queryRunner.hasTable('wa_invoices'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'wa_invoices',
          columns: [
            id,
            { name: 'businessId', type: 'varchar', length: '64' },
            { name: 'sessionId', type: 'varchar', length: '64' },
            { name: 'number', type: 'varchar', length: '32' },
            { name: 'sellerName', type: 'varchar', length: '120' },
            { name: 'sellerGstin', type: 'varchar', length: '20', isNullable: true },
            { name: 'sellerAddress', type: 'varchar', length: '300', isNullable: true },
            { name: 'customerName', type: 'varchar', length: '120' },
            { name: 'phone', type: 'varchar', length: '32' },
            { name: 'items', type: 'text' },
            { name: 'gstPercent', type: 'float', default: 0 },
            { name: 'totalPaise', type: 'int' },
            { name: 'status', type: 'varchar', length: '10', default: "'paid'" },
            { name: 'sendError', type: 'varchar', length: '300', isNullable: true },
            { name: 'sentAt', type: 'datetime', isNullable: true },
            createdAt,
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'wa_invoices',
        new TableIndex({ name: 'IDX_wa_invoices_business_created', columnNames: ['businessId', 'createdAt'] }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of ['wa_invoices', 'wa_calls', 'ad_referrals']) {
      if (await queryRunner.hasTable(t)) await queryRunner.dropTable(t);
    }
  }
}

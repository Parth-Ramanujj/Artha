import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';
import { portableColumn, portableTable } from '../portable-table';

/** Shopify store connection + abandoned-checkout reminders, and volume-discount tiers for the wallet. */
export class AddShopifyCommerce1790000000000 implements MigrationInterface {
  name = 'AddShopifyCommerce1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const now = { type: 'datetime', default: 'CURRENT_TIMESTAMP' };
    if (!(await queryRunner.hasTable('shopify_stores'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'shopify_stores',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
            { name: 'businessId', type: 'varchar', length: '36' },
            { name: 'shopDomain', type: 'varchar', length: '255' },
            { name: 'clientId', type: 'varchar', length: '255' },
            { name: 'clientSecret', type: 'text' },
            { name: 'legacyToken', type: 'text', isNullable: true },
            { name: 'shopName', type: 'varchar', length: '255', default: "''" },
            { name: 'currency', type: 'varchar', length: '3', default: "'INR'" },
            { name: 'status', type: 'varchar', length: '20', default: "'connected'" },
            { name: 'lastError', type: 'text', isNullable: true },
            { name: 'productsSynced', type: 'integer', default: 0 },
            { name: 'lastSyncAt', type: 'datetime', isNullable: true },
            { name: 'webhooks', type: 'text', isNullable: true },
            { name: 'recoveryEnabled', type: 'boolean', default: false },
            { name: 'recoveryDelayMinutes', type: 'integer', default: 30 },
            { name: 'discountCode', type: 'varchar', length: '60', default: "''" },
            { name: 'messageTemplate', type: 'text' },
            { name: 'sessionId', type: 'varchar', length: '100', isNullable: true },
            { name: 'defaultCountryCode', type: 'varchar', length: '4', default: "'91'" },
            { name: 'createdAt', ...now },
            { name: 'updatedAt', ...now },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'shopify_stores',
        new TableIndex({ name: 'UQ_shopify_stores_business', columnNames: ['businessId'], isUnique: true }),
      );
      await queryRunner.createIndex(
        'shopify_stores',
        new TableIndex({ name: 'UQ_shopify_stores_domain', columnNames: ['shopDomain'], isUnique: true }),
      );
    }

    if (!(await queryRunner.hasTable('shopify_checkouts'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'shopify_checkouts',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
            { name: 'businessId', type: 'varchar', length: '36' },
            { name: 'token', type: 'varchar', length: '100' },
            { name: 'phone', type: 'varchar', length: '20', isNullable: true },
            { name: 'firstName', type: 'varchar', length: '100', isNullable: true },
            { name: 'checkoutUrl', type: 'text', isNullable: true },
            { name: 'totalPrice', type: 'float', default: 0 },
            { name: 'currency', type: 'varchar', length: '3', default: "'INR'" },
            { name: 'status', type: 'varchar', length: '20', default: "'waiting'" },
            { name: 'sendAt', type: 'datetime', isNullable: true },
            { name: 'sentAt', type: 'datetime', isNullable: true },
            { name: 'recoveredAt', type: 'datetime', isNullable: true },
            { name: 'orderTotal', type: 'float', default: 0 },
            { name: 'error', type: 'text', isNullable: true },
            { name: 'createdAt', ...now },
            { name: 'updatedAt', ...now },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'shopify_checkouts',
        new TableIndex({ name: 'UQ_shopify_checkouts_token', columnNames: ['businessId', 'token'], isUnique: true }),
      );
      await queryRunner.createIndex(
        'shopify_checkouts',
        new TableIndex({ name: 'IDX_shopify_checkouts_due', columnNames: ['status', 'sendAt'] }),
      );
    }

    if (!(await queryRunner.hasColumn('wallet_settings', 'volumeTiers'))) {
      await queryRunner.addColumn(
        'wallet_settings',
        new TableColumn(portableColumn(queryRunner, { name: 'volumeTiers', type: 'text', isNullable: true })),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('wallet_settings', 'volumeTiers');
    await queryRunner.dropTable('shopify_checkouts', true);
    await queryRunner.dropTable('shopify_stores', true);
  }
}

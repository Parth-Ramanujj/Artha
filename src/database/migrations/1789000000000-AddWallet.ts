import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

/** Customer wallets: prepaid balance, transactions (Razorpay recharges, message charges) and default rates. */
export class AddWallet1789000000000 implements MigrationInterface {
  name = 'AddWallet1789000000000';

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

    if (!(await queryRunner.hasTable('wallets'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'wallets',
          columns: [
            id,
            { name: 'businessId', type: 'varchar', length: '36' },
            { name: 'enabled', type: 'boolean', default: false },
            { name: 'balancePaise', type: 'integer', default: 0 },
            { name: 'blockWhenEmpty', type: 'boolean', default: true },
            { name: 'lowBalanceAlertPaise', type: 'integer', default: 10000 },
            { name: 'lowBalanceAlerted', type: 'boolean', default: false },
            { name: 'ratesPaise', type: 'text', isNullable: true },
            { name: 'updatedAt', ...now },
          ],
        }),
        true,
      );
      await queryRunner.createIndex('wallets', new TableIndex({ columnNames: ['businessId'], isUnique: true }));
    }

    if (!(await queryRunner.hasTable('wallet_transactions'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'wallet_transactions',
          columns: [
            id,
            { name: 'businessId', type: 'varchar', length: '36' },
            { name: 'type', type: 'varchar', length: '20' },
            { name: 'status', type: 'varchar', length: '20', default: "'success'" },
            { name: 'amountPaise', type: 'integer' },
            { name: 'balanceAfterPaise', type: 'integer', isNullable: true },
            { name: 'description', type: 'varchar', length: '300' },
            { name: 'reference', type: 'varchar', length: '200' },
            { name: 'razorpayPaymentId', type: 'varchar', length: '100', isNullable: true },
            { name: 'createdAt', ...now },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'wallet_transactions',
        new TableIndex({ name: 'UQ_wallet_tx_type_reference', columnNames: ['type', 'reference'], isUnique: true }),
      );
      await queryRunner.createIndex(
        'wallet_transactions',
        new TableIndex({ name: 'IDX_wallet_tx_business_created', columnNames: ['businessId', 'createdAt'] }),
      );
    }

    if (!(await queryRunner.hasTable('wallet_settings'))) {
      await queryRunner.createTable(
        portableTable(queryRunner, {
          name: 'wallet_settings',
          columns: [
            { name: 'id', type: 'varchar', length: '20', isPrimary: true },
            { name: 'ratesPaise', type: 'text', isNullable: true },
            { name: 'updatedAt', ...now },
          ],
        }),
        true,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of ['wallet_settings', 'wallet_transactions', 'wallets']) {
      if (await queryRunner.hasTable(t)) await queryRunner.dropTable(t);
    }
  }
}

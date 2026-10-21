import { MigrationInterface, QueryRunner, TableColumnOptions, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

export class AddMessageStudio1787600000000 implements MigrationInterface {
  name = 'AddMessageStudio1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('studio_messages')) return;
    // Matches dateColumnType(): text on SQLite (DateTransformer), timestamp on PostgreSQL.
    const appDate = queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'text';
    const id: TableColumnOptions = {
      name: 'id',
      type: 'varchar',
      length: '36',
      isPrimary: true,
      isGenerated: true,
      generationStrategy: 'uuid',
    };
    const createdAt: TableColumnOptions = { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
    const updatedAt: TableColumnOptions = { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'studio_messages',
        columns: [
          id,
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'kind', type: 'varchar', length: '20' },
          { name: 'status', type: 'varchar', length: '20', default: "'draft'" },
          { name: 'content', type: 'text' },
          { name: 'presetKey', type: 'varchar', length: '40', isNullable: true },
          { name: 'readiness', type: 'varchar', length: '20', default: "'needs_attention'" },
          { name: 'lastTest', type: 'text', isNullable: true },
          { name: 'lastUsedAt', type: appDate, isNullable: true },
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('studio_messages', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'studio_products',
        columns: [
          id,
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '150' },
          { name: 'sku', type: 'varchar', length: '64', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'category', type: 'varchar', length: '80', isNullable: true },
          { name: 'price', type: 'float', default: 0 },
          { name: 'currency', type: 'varchar', length: '3', default: "'INR'" },
          { name: 'imageUrl', type: 'varchar', length: '2000', isNullable: true },
          { name: 'productUrl', type: 'varchar', length: '2000', isNullable: true },
          { name: 'inStock', type: 'boolean', default: true },
          { name: 'retailerId', type: 'varchar', length: '100', isNullable: true },
          { name: 'archived', type: 'boolean', default: false },
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('studio_products', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex('studio_products', new TableIndex({ columnNames: ['businessId', 'sku'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'studio_settings',
        columns: [
          id,
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'metaCatalogId', type: 'varchar', length: '64', isNullable: true },
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('studio_settings', new TableIndex({ columnNames: ['businessId'], isUnique: true }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('studio_settings', true);
    await queryRunner.dropTable('studio_products', true);
    await queryRunner.dropTable('studio_messages', true);
  }
}

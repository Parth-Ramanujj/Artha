import { MigrationInterface, QueryRunner, TableColumnOptions, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

export class AddWhatsAppForms1787900000000 implements MigrationInterface {
  name = 'AddWhatsAppForms1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('whatsapp_forms')) return;
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

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'whatsapp_forms',
        columns: [
          id,
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '200' },
          { name: 'category', type: 'varchar', length: '40', default: "'OTHER'" },
          { name: 'status', type: 'varchar', length: '20', default: "'draft'" },
          { name: 'definition', type: 'text' },
          { name: 'metaFlowId', type: 'varchar', length: '64', isNullable: true },
          { name: 'publishedAt', type: appDate, isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('whatsapp_forms', new TableIndex({ columnNames: ['businessId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('whatsapp_forms', true);
  }
}

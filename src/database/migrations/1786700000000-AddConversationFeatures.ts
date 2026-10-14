import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddConversationFeatures1786700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Canned Responses
    await queryRunner.createTable(
      new Table({
        name: 'canned_responses',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'title', type: 'varchar', length: '100' },
          { name: 'shortcut', type: 'varchar', length: '50' },
          { name: 'content', type: 'text' },
          { name: 'category', type: 'varchar', length: '50', isNullable: true },
          { name: 'createdBy', type: 'varchar', length: '36', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('canned_responses', new TableIndex({ columnNames: ['businessId'] }));

    // Assignment Rules
    await queryRunner.createTable(
      new Table({
        name: 'assignment_rules',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'strategy', type: 'varchar', length: '30', default: "'round_robin'" },
          { name: 'agents', type: 'text', isNullable: true },
          { name: 'conditions', type: 'text', isNullable: true },
          { name: 'enabled', type: 'boolean', default: true },
          { name: 'priority', type: 'integer', default: 0 },
          { name: 'lastAssignedIndex', type: 'integer', default: 0 },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('assignment_rules', new TableIndex({ columnNames: ['businessId'] }));

    // Notifications
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'recipientId', type: 'varchar', length: '36', isNullable: true },
          { name: 'type', type: 'varchar', length: '40' },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'message', type: 'text', isNullable: true },
          { name: 'data', type: 'text', isNullable: true },
          { name: 'read', type: 'boolean', default: false },
          { name: 'readAt', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('notifications', new TableIndex({ columnNames: ['businessId'] }));

    // Contact Segments
    await queryRunner.createTable(
      new Table({
        name: 'contact_segments',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'filters', type: 'text', isNullable: true },
          { name: 'staticContactIds', type: 'text', isNullable: true },
          { name: 'type', type: 'varchar', length: '20', default: "'dynamic'" },
          { name: 'contactCount', type: 'integer', default: 0 },
          { name: 'createdBy', type: 'varchar', length: '36', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('contact_segments', new TableIndex({ columnNames: ['businessId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('contact_segments', true);
    await queryRunner.dropTable('notifications', true);
    await queryRunner.dropTable('assignment_rules', true);
    await queryRunner.dropTable('canned_responses', true);
  }
}

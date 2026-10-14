import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddIntegrationsAndAbTests1786800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'integrations',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'type', type: 'varchar', length: '30' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'status', type: 'varchar', length: '20', default: "'disconnected'" },
          { name: 'config', type: 'text', isNullable: true },
          { name: 'metadata', type: 'text', isNullable: true },
          { name: 'enabled', type: 'boolean', default: true },
          { name: 'lastError', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('integrations', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      new Table({
        name: 'sla_policies',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'firstResponseMinutes', type: 'integer', default: 15 },
          { name: 'resolutionMinutes', type: 'integer', default: 60 },
          { name: 'conditions', type: 'text', isNullable: true },
          { name: 'priority', type: 'integer', default: 0 },
          { name: 'enabled', type: 'boolean', default: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('sla_policies', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      new Table({
        name: 'sla_events',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'conversationId', type: 'varchar', length: '36' },
          { name: 'policyId', type: 'varchar', length: '36', isNullable: true },
          { name: 'type', type: 'varchar', length: '40' },
          { name: 'targetMinutes', type: 'integer', isNullable: true },
          { name: 'actualMinutes', type: 'integer', isNullable: true },
          { name: 'deadlineAt', type: 'text', isNullable: true },
          { name: 'resolvedAt', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('sla_events', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      new Table({
        name: 'ab_tests',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'status', type: 'varchar', length: '20', default: "'draft'" },
          { name: 'variants', type: 'text' },
          { name: 'results', type: 'text', isNullable: true },
          { name: 'winningVariantId', type: 'varchar', length: '36', isNullable: true },
          { name: 'sampleSize', type: 'integer', default: 100 },
          { name: 'startedAt', type: 'text', isNullable: true },
          { name: 'completedAt', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('ab_tests', new TableIndex({ columnNames: ['businessId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ab_tests', true);
    await queryRunner.dropTable('sla_events', true);
    await queryRunner.dropTable('sla_policies', true);
    await queryRunner.dropTable('integrations', true);
  }
}

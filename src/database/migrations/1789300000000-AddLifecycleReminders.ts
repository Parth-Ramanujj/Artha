import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';
import { portableTable, portableColumn } from '../portable-table';

export class AddLifecycleReminders1789300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('deals', 'stageChangedAt'))) {
      if (queryRunner.connection.options.type !== 'postgres') {
        await queryRunner.query('ALTER TABLE "deals" ADD COLUMN "stageChangedAt" datetime');
      } else {
        await queryRunner.addColumn(
          'deals',
          new TableColumn(portableColumn(queryRunner, { name: 'stageChangedAt', type: 'datetime', isNullable: true })),
        );
      }
    }

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'reminders',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'dealId', type: 'varchar', length: '36', isNullable: true },
          { name: 'conversationId', type: 'varchar', length: '36', isNullable: true },
          { name: 'sourceRuleId', type: 'varchar', length: '36', isNullable: true },
          { name: 'reason', type: 'varchar', length: '40', default: "'manual'" },
          { name: 'cycleAt', type: 'datetime', isNullable: true },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'assignedTo', type: 'varchar', length: '100', default: "'Unassigned'" },
          { name: 'dueAt', type: 'datetime' },
          { name: 'status', type: 'varchar', length: '20', default: "'open'" },
          { name: 'notifiedAt', type: 'datetime', isNullable: true },
          { name: 'completedAt', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('reminders', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex('reminders', new TableIndex({ columnNames: ['dealId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('reminders', true);
    await queryRunner.dropColumn('deals', 'stageChangedAt');
  }
}

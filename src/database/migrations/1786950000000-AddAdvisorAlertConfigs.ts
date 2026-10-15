import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddAdvisorAlertConfigs1786950000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'advisor_alert_configs',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'sessionId', type: 'varchar', length: '36' },
          { name: 'advisorChatId', type: 'varchar', length: '100' },
          { name: 'advisorName', type: 'varchar', length: '100', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'advisor_alert_configs',
      new TableIndex({
        name: 'IDX_advisor_alert_configs_unique',
        columnNames: ['businessId', 'sessionId', 'advisorChatId'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('advisor_alert_configs', true);
  }
}

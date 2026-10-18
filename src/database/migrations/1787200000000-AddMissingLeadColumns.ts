import { MigrationInterface, QueryRunner } from 'typeorm';

// 1786600000000 created workflow_leads without these Lead entity columns, so every lead read/insert
// failed with "no such column: Lead.workflowId".
export class AddMissingLeadColumns1787200000000 implements MigrationInterface {
  name = 'AddMissingLeadColumns1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    const columns: [string, string][] = [
      ['workflowId', 'varchar(36)'],
      ['conversationId', 'varchar(36)'],
      ['metadata', 'text'],
      ['contactedAt', isPostgres ? 'timestamp' : 'text'],
    ];
    for (const [name, type] of columns) {
      if (!(await queryRunner.hasColumn('workflow_leads', name))) {
        await queryRunner.query(`ALTER TABLE "workflow_leads" ADD COLUMN "${name}" ${type}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['contactedAt', 'metadata', 'conversationId', 'workflowId']) {
      await queryRunner.query(`ALTER TABLE "workflow_leads" DROP COLUMN "${name}"`);
    }
  }
}

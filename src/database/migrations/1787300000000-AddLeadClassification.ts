import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeadClassification1787300000000 implements MigrationInterface {
  name = 'AddLeadClassification1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: [string, string][] = [
      ['firstMessage', 'text'],
      ['temperature', 'varchar(10)'],
      ['interest', 'varchar(30)'],
      ['classifiedBy', 'varchar(10)'],
      ['classificationReason', 'varchar(300)'],
    ];
    for (const [name, type] of columns) {
      if (!(await queryRunner.hasColumn('workflow_leads', name))) {
        await queryRunner.query(`ALTER TABLE "workflow_leads" ADD COLUMN "${name}" ${type}`);
      }
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_leads_business_temperature" ON "workflow_leads" ("businessId", "temperature")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflow_leads_business_temperature"`);
    for (const name of ['classificationReason', 'classifiedBy', 'interest', 'temperature', 'firstMessage']) {
      await queryRunner.query(`ALTER TABLE "workflow_leads" DROP COLUMN "${name}"`);
    }
  }
}

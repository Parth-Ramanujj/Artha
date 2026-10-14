import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessIdToAuditLogs1786300000000 implements MigrationInterface {
  name = 'AddBusinessIdToAuditLogs1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('audit_logs', 'businessId');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "businessId" varchar(36)`);
      await queryRunner.query(`CREATE INDEX "IDX_audit_logs_businessId" ON "audit_logs" ("businessId")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_businessId"`);
    const hasColumn = await queryRunner.hasColumn('audit_logs', 'businessId');
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "businessId"`);
    }
  }
}

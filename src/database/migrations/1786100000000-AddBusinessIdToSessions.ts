import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessIdToSessions1786100000000 implements MigrationInterface {
  name = 'AddBusinessIdToSessions1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('sessions', 'businessId');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "sessions" ADD COLUMN "businessId" varchar(36)`);
      await queryRunner.query(`CREATE INDEX "IDX_sessions_businessId" ON "sessions" ("businessId")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sessions_businessId"`);
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    if (isPostgres) {
      await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN IF EXISTS "businessId"`);
    } else {
      const hasColumn = await queryRunner.hasColumn('sessions', 'businessId');
      if (hasColumn) {
        await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "businessId"`);
      }
    }
  }
}

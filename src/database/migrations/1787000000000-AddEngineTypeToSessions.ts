import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEngineTypeToSessions1787000000000 implements MigrationInterface {
  name = 'AddEngineTypeToSessions1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('sessions', 'engineType');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "sessions" ADD COLUMN "engineType" varchar(30)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    if (isPostgres) {
      await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN IF EXISTS "engineType"`);
    } else {
      const hasColumn = await queryRunner.hasColumn('sessions', 'engineType');
      if (hasColumn) {
        await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "engineType"`);
      }
    }
  }
}

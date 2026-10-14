import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessIdToApiKeys1786200000000 implements MigrationInterface {
  name = 'AddBusinessIdToApiKeys1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('api_keys', 'businessId');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "api_keys" ADD COLUMN "businessId" varchar(36)`);
      await queryRunner.query(`CREATE INDEX "IDX_api_keys_businessId" ON "api_keys" ("businessId")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_keys_businessId"`);
    const hasColumn = await queryRunner.hasColumn('api_keys', 'businessId');
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "businessId"`);
    }
  }
}

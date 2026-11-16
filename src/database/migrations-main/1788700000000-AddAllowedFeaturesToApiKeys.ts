import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllowedFeaturesToApiKeys1788700000000 implements MigrationInterface {
  name = 'AddAllowedFeaturesToApiKeys1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('api_keys', 'allowedFeatures'))) {
      await queryRunner.query(`ALTER TABLE "api_keys" ADD COLUMN "allowedFeatures" text`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('api_keys', 'allowedFeatures')) {
      await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "allowedFeatures"`);
    }
  }
}

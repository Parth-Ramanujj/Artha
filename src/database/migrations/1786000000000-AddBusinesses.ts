import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinesses1786000000000 implements MigrationInterface {
  name = 'AddBusinesses1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    const ts = isPostgres ? 'timestamp' : 'datetime';
    const now = isPostgres ? 'NOW()' : "(datetime('now'))";
    const boolTrue = isPostgres ? 'true' : '1';
    const jsonType = isPostgres ? 'jsonb' : 'text';

    if (!(await queryRunner.hasTable('businesses'))) {
      await queryRunner.query(
        `CREATE TABLE "businesses" (` +
          `"id" varchar PRIMARY KEY NOT NULL, ` +
          `"name" varchar(100) NOT NULL, ` +
          `"slug" varchar(100) NOT NULL, ` +
          `"plan" varchar(50) NOT NULL DEFAULT 'free', ` +
          `"isActive" boolean NOT NULL DEFAULT ${boolTrue}, ` +
          `"settings" ${jsonType}, ` +
          `"createdAt" ${ts} NOT NULL DEFAULT ${now}, ` +
          `"updatedAt" ${ts} NOT NULL DEFAULT ${now}` +
          `)`,
      );
      await queryRunner.query(`CREATE UNIQUE INDEX "UQ_businesses_name" ON "businesses" ("name")`);
      await queryRunner.query(`CREATE UNIQUE INDEX "UQ_businesses_slug" ON "businesses" ("slug")`);
    }

    if (!(await queryRunner.hasTable('business_memberships'))) {
      await queryRunner.query(
        `CREATE TABLE "business_memberships" (` +
          `"id" varchar PRIMARY KEY NOT NULL, ` +
          `"businessId" varchar(36) NOT NULL, ` +
          `"apiKeyId" varchar(36) NOT NULL, ` +
          `"businessRole" varchar(20) NOT NULL DEFAULT 'agent', ` +
          `"createdAt" ${ts} NOT NULL DEFAULT ${now}, ` +
          `"updatedAt" ${ts} NOT NULL DEFAULT ${now}, ` +
          `CONSTRAINT "FK_business_memberships_business" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE CASCADE` +
          `)`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_business_memberships_business_key" ON "business_memberships" ("businessId", "apiKeyId")`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_business_memberships_apiKeyId" ON "business_memberships" ("apiKeyId")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_business_memberships_apiKeyId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_business_memberships_business_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "business_memberships"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_businesses_slug"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_businesses_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "businesses"`);
  }
}

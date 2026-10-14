import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowEngine1786300000001 implements MigrationInterface {
  name = 'AddWorkflowEngine1786300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    const uuidDefault = isPostgres ? `DEFAULT gen_random_uuid()` : '';
    const timestampDefault = isPostgres ? `DEFAULT NOW()` : `DEFAULT (datetime('now'))`;

    await queryRunner.query(`
      CREATE TABLE "workflow_definitions" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "name" varchar(200) NOT NULL,
        "slug" varchar(100) NOT NULL,
        "description" text,
        "status" varchar(20) NOT NULL DEFAULT 'draft',
        "version" integer NOT NULL DEFAULT 1,
        "definition" ${isPostgres ? 'jsonb' : 'text'} NOT NULL,
        "maxActionsPerRun" integer NOT NULL DEFAULT 100,
        "maxExecutionSeconds" integer NOT NULL DEFAULT 300,
        "maxRetries" integer NOT NULL DEFAULT 3,
        "maxConcurrentRuns" integer NOT NULL DEFAULT 5,
        "publishedBy" varchar(36),
        "publishedAt" ${isPostgres ? 'timestamp' : 'text'},
        "createdBy" varchar(36),
        "updatedBy" varchar(36),
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_workflow_defs_businessId" ON "workflow_definitions" ("businessId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_workflow_slug_business" ON "workflow_definitions" ("businessId", "slug")`,
    );

    await queryRunner.query(`
      CREATE TABLE "workflow_runs" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "workflowId" varchar(36) NOT NULL,
        "businessId" varchar(36) NOT NULL,
        "sessionId" varchar(36),
        "workflowVersion" integer NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "triggerData" ${isPostgres ? 'jsonb' : 'text'},
        "steps" ${isPostgres ? 'jsonb' : 'text'},
        "actionCount" integer NOT NULL DEFAULT 0,
        "failureReason" text,
        "idempotencyKey" varchar(200),
        "startedAt" ${isPostgres ? 'timestamp' : 'text'},
        "completedAt" ${isPostgres ? 'timestamp' : 'text'},
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_workflow_runs_workflowId" ON "workflow_runs" ("workflowId")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_runs_businessId" ON "workflow_runs" ("businessId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_definitions"`);
  }
}

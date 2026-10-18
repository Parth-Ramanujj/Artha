import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets a customer's waiting run be found by chat in SQL instead of scanning the business's latest runs.
export class AddChatIdToWorkflowRuns1787400000000 implements MigrationInterface {
  name = 'AddChatIdToWorkflowRuns1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    if (!(await queryRunner.hasColumn('workflow_runs', 'chatId'))) {
      await queryRunner.query(`ALTER TABLE "workflow_runs" ADD COLUMN "chatId" varchar(100)`);
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_runs_session_chat_status" ON "workflow_runs" ("sessionId", "chatId", "status")`,
    );
    // Runs already waiting for an answer keep working after the upgrade.
    await queryRunner.query(
      isPostgres
        ? `UPDATE "workflow_runs" SET "chatId" = ("triggerData"::json ->> 'chatId') WHERE "status" = 'paused' AND "chatId" IS NULL`
        : `UPDATE "workflow_runs" SET "chatId" = json_extract("triggerData", '$.chatId') WHERE "status" = 'paused' AND "chatId" IS NULL AND json_valid("triggerData")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflow_runs_session_chat_status"`);
    await queryRunner.query(`ALTER TABLE "workflow_runs" DROP COLUMN "chatId"`);
  }
}

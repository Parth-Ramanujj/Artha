import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiModule1786400000000 implements MigrationInterface {
  name = 'AddAiModule1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    const uuidDefault = isPostgres ? `DEFAULT gen_random_uuid()` : '';
    const timestampDefault = isPostgres ? `DEFAULT NOW()` : `DEFAULT (datetime('now'))`;

    await queryRunner.query(`
      CREATE TABLE "ai_configs" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "enabled" ${isPostgres ? 'boolean' : 'integer'} NOT NULL DEFAULT ${isPostgres ? 'false' : '0'},
        "provider" varchar(30) NOT NULL DEFAULT 'openai',
        "model" varchar(200),
        "apiEndpoint" varchar(500),
        "systemPrompt" text,
        "maxTokens" integer NOT NULL DEFAULT 2000,
        "maxContextMessages" integer NOT NULL DEFAULT 10,
        "useKnowledgeBase" ${isPostgres ? 'boolean' : 'integer'} NOT NULL DEFAULT ${isPostgres ? 'true' : '1'},
        "autoHandoff" ${isPostgres ? 'boolean' : 'integer'} NOT NULL DEFAULT ${isPostgres ? 'true' : '1'},
        "handoffKeywords" varchar(500),
        "fallbackMessage" varchar(500),
        "sessionScopes" ${isPostgres ? 'jsonb' : 'text'},
        "metadata" ${isPostgres ? 'jsonb' : 'text'},
        "updatedBy" varchar(36),
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_ai_configs_businessId" ON "ai_configs" ("businessId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_ai_config_business" ON "ai_configs" ("businessId")`);

    await queryRunner.query(`
      CREATE TABLE "knowledge_documents" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "title" varchar(200) NOT NULL,
        "fileType" varchar(50) NOT NULL,
        "content" text NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ready',
        "errorMessage" text,
        "metadata" ${isPostgres ? 'jsonb' : 'text'},
        "uploadedBy" varchar(36),
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_knowledge_docs_businessId" ON "knowledge_documents" ("businessId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_configs"`);
  }
}

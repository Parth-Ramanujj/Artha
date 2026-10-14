import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowAgentsAndLeads1786600000000 implements MigrationInterface {
  name = 'AddWorkflowAgentsAndLeads1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    const uuidDefault = isPostgres ? `DEFAULT gen_random_uuid()` : '';
    const timestampDefault = isPostgres ? `DEFAULT NOW()` : `DEFAULT (datetime('now'))`;
    const jsonType = isPostgres ? 'jsonb' : 'text';
    const boolType = isPostgres ? 'boolean' : 'integer';
    const trueVal = isPostgres ? 'true' : '1';
    const floatType = isPostgres ? 'float' : 'real';

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_agents" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "name" varchar(150) NOT NULL,
        "phone" varchar(30) NOT NULL,
        "email" varchar(150),
        "profileImage" varchar(500),
        "rating" ${floatType} NOT NULL DEFAULT 4.8,
        "experienceYears" integer NOT NULL DEFAULT 5,
        "serviceArea" varchar(200) NOT NULL DEFAULT 'Pan-India',
        "pincodes" ${jsonType} NOT NULL,
        "supportedProducts" ${jsonType} NOT NULL,
        "supportedCompanies" ${jsonType},
        "description" text,
        "isActive" ${boolType} NOT NULL DEFAULT ${trueVal},
        "leadCapacity" integer NOT NULL DEFAULT 50,
        "currentLeadsCount" integer NOT NULL DEFAULT 0,
        "callLink" varchar(255),
        "whatsappLink" varchar(255),
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_agents_business_active" ON "workflow_agents" ("businessId", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_agents_businessId" ON "workflow_agents" ("businessId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_leads" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "leadNumber" varchar(50) NOT NULL UNIQUE,
        "businessId" varchar(36) NOT NULL,
        "sessionId" varchar(36),
        "chatId" varchar(100) NOT NULL,
        "customerPhone" varchar(30) NOT NULL,
        "customerName" varchar(200),
        "mainService" varchar(50) NOT NULL,
        "selectedService" varchar(100) NOT NULL,
        "productCategory" varchar(100),
        "subProduct" varchar(150),
        "claimIssueType" varchar(100),
        "insuranceCompany" varchar(200),
        "issueDescription" text,
        "pincode" varchar(10) NOT NULL,
        "city" varchar(100),
        "state" varchar(100),
        "matchedAgentId" varchar(36),
        "matchedAgentName" varchar(150),
        "matchedAgentPhone" varchar(30),
        "status" varchar(30) NOT NULL DEFAULT 'new',
        "customData" ${jsonType},
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_leads_business_chat" ON "workflow_leads" ("businessId", "chatId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_leads_business_status" ON "workflow_leads" ("businessId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_leads_business_pincode" ON "workflow_leads" ("businessId", "pincode")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_leads_businessId" ON "workflow_leads" ("businessId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_leads_sessionId" ON "workflow_leads" ("sessionId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_leads"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_agents"`);
  }
}

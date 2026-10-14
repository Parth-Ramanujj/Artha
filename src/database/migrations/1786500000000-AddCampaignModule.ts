import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCampaignModule1786500000000 implements MigrationInterface {
  name = 'AddCampaignModule1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    const uuidDefault = isPostgres ? `DEFAULT gen_random_uuid()` : '';
    const timestampDefault = isPostgres ? `DEFAULT NOW()` : `DEFAULT (datetime('now'))`;

    await queryRunner.query(`
      CREATE TABLE "contact_consents" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "waContactId" varchar(100) NOT NULL,
        "channel" varchar(50) NOT NULL DEFAULT 'whatsapp',
        "status" varchar(20) NOT NULL DEFAULT 'unknown',
        "consentedAt" ${isPostgres ? 'timestamp' : 'text'},
        "revokedAt" ${isPostgres ? 'timestamp' : 'text'},
        "source" varchar(500),
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_consents_businessId" ON "contact_consents" ("businessId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_consent_business_contact_channel" ON "contact_consents" ("businessId", "waContactId", "channel")`,
    );

    await queryRunner.query(`
      CREATE TABLE "scheduled_messages" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "sessionId" varchar(36) NOT NULL,
        "chatId" varchar(200) NOT NULL,
        "content" text NOT NULL,
        "messageOptions" ${isPostgres ? 'jsonb' : 'text'},
        "scheduledAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "sentAt" ${isPostgres ? 'timestamp' : 'text'},
        "errorMessage" text,
        "retryCount" integer NOT NULL DEFAULT 0,
        "campaignId" varchar(36),
        "createdBy" varchar(36),
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_scheduled_businessId" ON "scheduled_messages" ("businessId")`);
    await queryRunner.query(`CREATE INDEX "IDX_scheduled_scheduledAt" ON "scheduled_messages" ("scheduledAt")`);

    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text,
        "sessionId" varchar(36) NOT NULL,
        "templateId" varchar(36),
        "messageContent" text,
        "messageOptions" ${isPostgres ? 'jsonb' : 'text'},
        "status" varchar(20) NOT NULL DEFAULT 'draft',
        "scheduledAt" ${isPostgres ? 'timestamp' : 'text'},
        "startedAt" ${isPostgres ? 'timestamp' : 'text'},
        "completedAt" ${isPostgres ? 'timestamp' : 'text'},
        "ratePerMinute" integer NOT NULL DEFAULT 10,
        "totalRecipients" integer NOT NULL DEFAULT 0,
        "sentCount" integer NOT NULL DEFAULT 0,
        "deliveredCount" integer NOT NULL DEFAULT 0,
        "failedCount" integer NOT NULL DEFAULT 0,
        "targetFilters" ${isPostgres ? 'jsonb' : 'text'},
        "createdBy" varchar(36),
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_campaigns_businessId" ON "campaigns" ("businessId")`);

    await queryRunner.query(`
      CREATE TABLE "campaign_recipients" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "campaignId" varchar(36) NOT NULL,
        "chatId" varchar(200) NOT NULL,
        "contactName" varchar(200),
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "sentAt" ${isPostgres ? 'timestamp' : 'text'},
        "deliveredAt" ${isPostgres ? 'timestamp' : 'text'},
        "errorMessage" text,
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_recipients_campaignId" ON "campaign_recipients" ("campaignId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_campaign_recipient" ON "campaign_recipients" ("campaignId", "chatId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_recipients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_consents"`);
  }
}

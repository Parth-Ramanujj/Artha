import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationsAndContacts1786200000001 implements MigrationInterface {
  name = 'AddConversationsAndContacts1786200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.dataSource.options.type === 'postgres';
    const uuidDefault = isPostgres ? `DEFAULT gen_random_uuid()` : '';
    const timestampDefault = isPostgres ? `DEFAULT NOW()` : `DEFAULT (datetime('now'))`;

    await queryRunner.query(`
      CREATE TABLE "contacts" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "waContactId" varchar(100) NOT NULL,
        "phone" varchar(20),
        "name" varchar(200),
        "email" varchar(200),
        "notes" varchar(500),
        "tags" ${isPostgres ? 'jsonb' : 'text'},
        "metadata" ${isPostgres ? 'jsonb' : 'text'},
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_contacts_businessId" ON "contacts" ("businessId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_contacts_business_wa" ON "contacts" ("businessId", "waContactId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" varchar(36) PRIMARY KEY NOT NULL ${uuidDefault},
        "businessId" varchar(36) NOT NULL,
        "sessionId" varchar(36) NOT NULL,
        "chatId" varchar(100) NOT NULL,
        "chatName" varchar(200),
        "status" varchar(20) NOT NULL DEFAULT 'open',
        "assignedTo" varchar(36),
        "assignedName" varchar(200),
        "tags" ${isPostgres ? 'jsonb' : 'text'},
        "unreadCount" integer NOT NULL DEFAULT 0,
        "lastMessageAt" ${isPostgres ? 'timestamp' : 'text'},
        "lastMessagePreview" text,
        "metadata" ${isPostgres ? 'jsonb' : 'text'},
        "createdAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault},
        "updatedAt" ${isPostgres ? 'timestamp' : 'text'} NOT NULL ${timestampDefault}
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_conversations_businessId" ON "conversations" ("businessId")`);
    await queryRunner.query(`CREATE INDEX "IDX_conversations_sessionId" ON "conversations" ("sessionId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_conversations_session_chat" ON "conversations" ("sessionId", "chatId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`);
  }
}

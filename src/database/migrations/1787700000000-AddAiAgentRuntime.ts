import { MigrationInterface, QueryRunner } from 'typeorm';

// The AI Agents page becomes real: agents answer WhatsApp chats by keyword, or through an external webhook.
const COLUMNS: Array<[string, (postgres: boolean) => string]> = [
  ['externalPlatform', () => 'varchar(30)'],
  ['responseJsonPath', () => 'varchar(200)'],
  ['externalStatus', () => 'varchar(20)'],
  ['lastPingMs', () => 'integer'],
  ['temperature', p => (p ? 'double precision NOT NULL DEFAULT 0.5' : 'float NOT NULL DEFAULT 0.5')],
  // simple-json columns are text on both databases.
  ['triggerKeywords', () => 'text'],
  ['sessionId', () => 'varchar(36)'],
  ['autonomous', p => (p ? 'boolean NOT NULL DEFAULT false' : 'boolean NOT NULL DEFAULT 0')],
];

export class AddAiAgentRuntime1787700000000 implements MigrationInterface {
  name = 'AddAiAgentRuntime1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.dataSource.options.type === 'postgres';
    for (const [column, type] of COLUMNS) {
      if (!(await queryRunner.hasColumn('ai_agents', column))) {
        await queryRunner.query(`ALTER TABLE "ai_agents" ADD COLUMN "${column}" ${type(postgres)}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [column] of [...COLUMNS].reverse()) {
      await queryRunner.query(`ALTER TABLE "ai_agents" DROP COLUMN "${column}"`);
    }
  }
}

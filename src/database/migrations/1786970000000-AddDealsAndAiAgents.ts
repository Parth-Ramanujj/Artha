import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

export class AddDealsAndAiAgents1786970000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Deals table for Sales Pipeline CRM
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'deals',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'title', type: 'varchar', length: '255' },
          { name: 'contactName', type: 'varchar', length: '255' },
          { name: 'contactPhone', type: 'varchar', length: '50' },
          { name: 'amount', type: 'float', default: 0 },
          { name: 'stage', type: 'varchar', length: '50', default: "'lead'" },
          { name: 'priority', type: 'varchar', length: '20', default: "'medium'" },
          { name: 'assignedTo', type: 'varchar', length: '100', default: "'Unassigned'" },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'tags', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('deals', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex('deals', new TableIndex({ columnNames: ['stage'] }));

    // 2. AI Agents table for Autonomous Astra Bots
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'ai_agents',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'role', type: 'varchar', length: '100', default: "'Customer Support'" },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'model', type: 'varchar', length: '100', default: "'llama-3.3-70b-versatile'" },
          { name: 'systemPrompt', type: 'text', isNullable: true },
          { name: 'avatar', type: 'varchar', length: '255', default: "'🤖'" },
          { name: 'status', type: 'varchar', length: '20', default: "'active'" },
          { name: 'conversationsHandled', type: 'integer', default: 0 },
          { name: 'resolutionRate', type: 'integer', default: 95 },
          { name: 'isExternal', type: 'boolean', default: 0 },
          { name: 'externalWebhookUrl', type: 'varchar', length: '500', isNullable: true },
          { name: 'externalAuthToken', type: 'varchar', length: '500', isNullable: true },
          { name: 'isVoiceEnabled', type: 'boolean', default: 0 },
          { name: 'voiceConfig', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('ai_agents', new TableIndex({ columnNames: ['businessId'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ai_agents', true);
    await queryRunner.dropTable('deals', true);
  }
}

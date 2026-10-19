import { MigrationInterface, QueryRunner, TableColumnOptions, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

export class AddAiCalling1787500000000 implements MigrationInterface {
  name = 'AddAiCalling1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Matches dateColumnType(): text on SQLite (DateTransformer), timestamp on PostgreSQL.
    const appDate = queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'text';
    const id: TableColumnOptions = {
      name: 'id',
      type: 'varchar',
      length: '36',
      isPrimary: true,
      isGenerated: true,
      generationStrategy: 'uuid',
    };
    const stamps: TableColumnOptions[] = [
      { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
    ];

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'voice_agents',
        columns: [
          id,
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'personaName', type: 'varchar', length: '60' },
          { name: 'companyName', type: 'varchar', length: '120' },
          { name: 'greeting', type: 'text' },
          { name: 'script', type: 'text' },
          { name: 'verifiedLeadCriteria', type: 'text' },
          { name: 'defaultLanguage', type: 'varchar', length: '10', default: "'gu-IN'" },
          { name: 'gujaratiVoice', type: 'varchar', length: '60', default: "'pooja_gu_customer'" },
          { name: 'hindiVoice', type: 'varchar', length: '60', default: "'ritu_hi_customer_warm'" },
          { name: 'pace', type: 'float', default: 1 },
          { name: 'model', type: 'varchar', length: '80', default: "'openai/gpt-oss-120b'" },
          { name: 'maxCallSeconds', type: 'integer', default: 300 },
          { name: 'concurrency', type: 'integer', default: 1 },
          { name: 'maxAttempts', type: 'integer', default: 2 },
          { name: 'retryAfterMinutes', type: 'integer', default: 30 },
          { name: 'callingStart', type: 'varchar', length: '5', default: "'09:00'" },
          { name: 'callingEnd', type: 'varchar', length: '5', default: "'21:00'" },
          { name: 'callingTimezone', type: 'varchar', length: '50', default: "'Asia/Kolkata'" },
          { name: 'whatsappFollowup', type: 'boolean', default: false },
          { name: 'whatsappMessage', type: 'text', isNullable: true },
          { name: 'whatsappSessionId', type: 'varchar', length: '36', isNullable: true },
          { name: 'isDefault', type: 'boolean', default: true },
          ...stamps,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('voice_agents', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'ai_calls',
        columns: [
          id,
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'agentId', type: 'varchar', length: '36' },
          { name: 'batchId', type: 'varchar', length: '36', isNullable: true },
          { name: 'leadId', type: 'varchar', length: '36', isNullable: true },
          { name: 'phone', type: 'varchar', length: '20' },
          { name: 'contactName', type: 'varchar', length: '120', isNullable: true },
          { name: 'channel', type: 'varchar', length: '10', default: "'phone'" },
          { name: 'status', type: 'varchar', length: '20', default: "'queued'" },
          { name: 'attempts', type: 'integer', default: 0 },
          { name: 'nextAttemptAt', type: appDate, isNullable: true },
          { name: 'twilioCallSid', type: 'varchar', length: '64', isNullable: true },
          { name: 'startedAt', type: appDate, isNullable: true },
          { name: 'answeredAt', type: appDate, isNullable: true },
          { name: 'endedAt', type: appDate, isNullable: true },
          { name: 'durationSeconds', type: 'integer', default: 0 },
          { name: 'language', type: 'varchar', length: '10', isNullable: true },
          { name: 'transcript', type: 'text', isNullable: true },
          { name: 'summary', type: 'text', isNullable: true },
          { name: 'sentiment', type: 'varchar', length: '10', isNullable: true },
          { name: 'outcome', type: 'varchar', length: '20', isNullable: true },
          { name: 'extracted', type: 'text', isNullable: true },
          { name: 'isVerifiedLead', type: 'boolean', default: false },
          { name: 'leadTemperature', type: 'varchar', length: '10', isNullable: true },
          { name: 'whatsappSentAt', type: appDate, isNullable: true },
          { name: 'error', type: 'text', isNullable: true },
          ...stamps,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('ai_calls', new TableIndex({ columnNames: ['businessId', 'createdAt'] }));
    await queryRunner.createIndex('ai_calls', new TableIndex({ columnNames: ['businessId', 'status'] }));
    await queryRunner.createIndex('ai_calls', new TableIndex({ columnNames: ['batchId'] }));
    await queryRunner.createIndex('ai_calls', new TableIndex({ columnNames: ['phone'] }));
    await queryRunner.createIndex('ai_calls', new TableIndex({ columnNames: ['isVerifiedLead'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'ai_call_batches',
        columns: [
          id,
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'agentId', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '150' },
          { name: 'source', type: 'varchar', length: '10', default: "'upload'" },
          { name: 'status', type: 'varchar', length: '12', default: "'running'" },
          { name: 'totalContacts', type: 'integer', default: 0 },
          { name: 'sendWhatsapp', type: 'boolean', default: false },
          ...stamps,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('ai_call_batches', new TableIndex({ columnNames: ['businessId'] }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'ai_calling_settings',
        columns: [
          { name: 'key', type: 'varchar', length: '60', isPrimary: true },
          { name: 'value', type: 'text' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ai_calling_settings', true);
    await queryRunner.dropTable('ai_call_batches', true);
    await queryRunner.dropTable('ai_calls', true);
    await queryRunner.dropTable('voice_agents', true);
  }
}

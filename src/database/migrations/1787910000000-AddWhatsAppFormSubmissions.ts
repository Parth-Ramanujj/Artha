import { MigrationInterface, QueryRunner, TableColumnOptions, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

export class AddWhatsAppFormSubmissions1787910000000 implements MigrationInterface {
  name = 'AddWhatsAppFormSubmissions1787910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('whatsapp_form_submissions')) return;
    const id: TableColumnOptions = {
      name: 'id',
      type: 'varchar',
      length: '36',
      isPrimary: true,
      isGenerated: true,
      generationStrategy: 'uuid',
    };

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'whatsapp_form_submissions',
        columns: [
          id,
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'formId', type: 'varchar', length: '36' },
          { name: 'sessionId', type: 'varchar', length: '64' },
          { name: 'chatId', type: 'varchar', length: '120' },
          { name: 'messageId', type: 'varchar', length: '200' },
          { name: 'flowToken', type: 'varchar', length: '120' },
          { name: 'answers', type: 'text' },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('whatsapp_form_submissions', new TableIndex({ columnNames: ['formId'] }));
    await queryRunner.createIndex('whatsapp_form_submissions', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex(
      'whatsapp_form_submissions',
      new TableIndex({ columnNames: ['messageId'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('whatsapp_form_submissions', true);
  }
}

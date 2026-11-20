import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

/** Instagram DMs and Facebook Messenger messages, shown in the Chats inbox next to WhatsApp. */
export class AddSocialMessages1789400000000 implements MigrationInterface {
  name = 'AddSocialMessages1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('social_messages')) return;
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'social_messages',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
          { name: 'businessId', type: 'varchar', length: '36' },
          { name: 'accountId', type: 'varchar', length: '36' },
          { name: 'platform', type: 'varchar', length: '20' },
          { name: 'threadId', type: 'varchar', length: '100' },
          { name: 'customerName', type: 'varchar', length: '150', isNullable: true },
          { name: 'direction', type: 'varchar', length: '10' },
          { name: 'text', type: 'text', isNullable: true },
          { name: 'mediaUrl', type: 'text', isNullable: true },
          { name: 'remoteMessageId', type: 'varchar', length: '200', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'social_messages',
      new TableIndex({ columnNames: ['businessId', 'platform', 'createdAt'] }),
    );
    await queryRunner.createIndex('social_messages', new TableIndex({ columnNames: ['accountId', 'threadId'] }));
    await queryRunner.createIndex(
      'social_messages',
      new TableIndex({ columnNames: ['remoteMessageId'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('social_messages', true);
  }
}

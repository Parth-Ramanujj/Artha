import { MigrationInterface, QueryRunner, TableColumnOptions, TableIndex } from 'typeorm';
import { portableTable } from '../portable-table';

const id = (): TableColumnOptions => ({
  name: 'id',
  type: 'varchar',
  length: '36',
  isPrimary: true,
  isGenerated: true,
  generationStrategy: 'uuid',
});
const str = (name: string, length: number, nullable = false): TableColumnOptions =>
  nullable
    ? { name, type: 'varchar', length: String(length), isNullable: true }
    : { name, type: 'varchar', length: String(length), default: "''" };
const text = (name: string, nullable = true): TableColumnOptions =>
  nullable ? { name, type: 'text', isNullable: true } : { name, type: 'text', default: "''" };
const bool = (name: string, value: boolean): TableColumnOptions => ({ name, type: 'boolean', default: value });
const int = (name: string, value = 0): TableColumnOptions => ({ name, type: 'integer', default: value });
const date = (name: string): TableColumnOptions => ({ name, type: 'datetime', isNullable: true });
const createdAt: TableColumnOptions = { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const updatedAt: TableColumnOptions = { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const businessId: TableColumnOptions = { name: 'businessId', type: 'varchar', length: '36' };

/** Social Automation: scheduled posts and comment auto-reply/like engine for Meta (Instagram & Facebook). */
export class AddSocialAutomation1788600000000 implements MigrationInterface {
  name = 'AddSocialAutomation1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('social_accounts')) return;

    // 1. social_accounts
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'social_accounts',
        columns: [
          id(),
          businessId,
          str('platform', 20),
          str('accountName', 150),
          str('accountId', 100),
          text('accessToken', false),
          str('pageId', 100, true),
          str('webhookVerifyToken', 150, true),
          { name: 'status', type: 'varchar', length: '20', default: "'connected'" },
          date('tokenExpiresAt'),
          text('metadata', false),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('social_accounts', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex('social_accounts', new TableIndex({ columnNames: ['accountId'] }));

    // 2. social_posts
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'social_posts',
        columns: [
          id(),
          businessId,
          str('accountId', 36, true),
          { name: 'platform', type: 'varchar', length: '20', default: "'instagram'" },
          text('caption', false),
          text('mediaUrl', false),
          { name: 'mediaType', type: 'varchar', length: '20', default: "'IMAGE'" },
          { name: 'status', type: 'varchar', length: '20', default: "'draft'" },
          date('scheduledAt'),
          date('publishedAt'),
          str('remotePostId', 100, true),
          text('permalink', true),
          text('error', true),
          str('createdBy', 100, true),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('social_posts', new TableIndex({ columnNames: ['businessId'] }));
    await queryRunner.createIndex('social_posts', new TableIndex({ columnNames: ['status', 'scheduledAt'] }));

    // 3. social_comment_rules
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'social_comment_rules',
        columns: [
          id(),
          businessId,
          str('name', 150),
          { name: 'platform', type: 'varchar', length: '20', default: "'all'" },
          str('postId', 100, true),
          { name: 'matchType', type: 'varchar', length: '20', default: "'contains'" },
          text('keywords', false),
          text('replyTemplates', false),
          bool('autoLike', true),
          bool('autoDm', false),
          text('autoDmTemplate', true),
          bool('useAi', false),
          text('aiPrompt', true),
          int('delaySeconds', 3),
          bool('enabled', true),
          int('triggerCount', 0),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('social_comment_rules', new TableIndex({ columnNames: ['businessId'] }));

    // 4. social_comment_logs
    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'social_comment_logs',
        columns: [
          id(),
          businessId,
          str('platform', 20),
          str('postId', 100),
          str('commentId', 100),
          str('fromUserId', 100, true),
          str('fromUserName', 150, true),
          text('commentText', false),
          bool('liked', false),
          bool('replied', false),
          text('replyText', true),
          str('ruleId', 36, true),
          { name: 'status', type: 'varchar', length: '20', default: "'success'" },
          text('error', true),
          createdAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('social_comment_logs', new TableIndex({ columnNames: ['businessId', 'createdAt'] }));
    await queryRunner.createIndex(
      'social_comment_logs',
      new TableIndex({ columnNames: ['businessId', 'commentId'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('social_comment_logs', true);
    await queryRunner.dropTable('social_comment_rules', true);
    await queryRunner.dropTable('social_posts', true);
    await queryRunner.dropTable('social_accounts', true);
  }
}

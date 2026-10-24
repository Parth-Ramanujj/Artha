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
const str = (name: string, length: number): TableColumnOptions => ({
  name,
  type: 'varchar',
  length: String(length),
  default: "''",
});
const text = (name: string): TableColumnOptions => ({ name, type: 'text', default: "''" });
const int = (name: string, value: number): TableColumnOptions => ({ name, type: 'integer', default: value });
const bool = (name: string, value: boolean): TableColumnOptions => ({ name, type: 'boolean', default: value });
const date = (name: string): TableColumnOptions => ({ name, type: 'datetime', isNullable: true });
const createdAt: TableColumnOptions = { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const updatedAt: TableColumnOptions = { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' };
const businessId: TableColumnOptions = { name: 'businessId', type: 'varchar', length: '36' };

/** Google Business Profile automation: settings and mirrored reviews. */
export class AddGoogleBusiness1788100000000 implements MigrationInterface {
  name = 'AddGoogleBusiness1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('gbp_configs')) return;

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'gbp_configs',
        columns: [
          id(),
          businessId,
          bool('enabled', false),
          str('integrationId', 36),
          str('accountName', 100),
          { name: 'locations', type: 'text' },
          bool('autoDraft', true),
          int('autoPublishMinStars', 0),
          bool('autoPublishRequiresText', false),
          str('tone', 200),
          str('signature', 200),
          text('instructions'),
          str('alertSessionId', 100),
          str('alertPhone', 20),
          int('alertMaxStars', 3),
          int('syncMinutes', 30),
          text('reviewRequestTemplate'),
          date('lastSyncAt'),
          text('lastError'),
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex('gbp_configs', new TableIndex({ columnNames: ['businessId'], isUnique: true }));

    await queryRunner.createTable(
      portableTable(queryRunner, {
        name: 'gbp_reviews',
        columns: [
          id(),
          businessId,
          { name: 'reviewName', type: 'varchar', length: '300' },
          { name: 'locationName', type: 'varchar', length: '200' },
          str('locationTitle', 200),
          str('reviewerName', 200),
          str('reviewerPhoto', 500),
          int('stars', 0),
          text('comment'),
          date('reviewedAt'),
          date('reviewUpdatedAt'),
          text('replyText'),
          date('repliedAt'),
          str('repliedBy', 100),
          text('draft'),
          { name: 'status', type: 'varchar', length: '20', default: "'new'" },
          text('error'),
          date('alertedAt'),
          createdAt,
          updatedAt,
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'gbp_reviews',
      new TableIndex({ columnNames: ['businessId', 'reviewName'], isUnique: true }),
    );
    await queryRunner.createIndex('gbp_reviews', new TableIndex({ columnNames: ['businessId', 'status'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('gbp_reviews', true);
    await queryRunner.dropTable('gbp_configs', true);
  }
}

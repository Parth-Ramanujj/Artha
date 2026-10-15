import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddContactLinkToDeals1787100000000 implements MigrationInterface {
  name = 'AddContactLinkToDeals1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('deals', 'contactId'))) {
      await queryRunner.query(`ALTER TABLE "deals" ADD COLUMN "contactId" varchar(36)`);
    }
    if (!(await queryRunner.hasColumn('deals', 'conversationId'))) {
      await queryRunner.query(`ALTER TABLE "deals" ADD COLUMN "conversationId" varchar(36)`);
    }
    await queryRunner.createIndex('deals', new TableIndex({ name: 'IDX_deals_contactId', columnNames: ['contactId'] }));
    await queryRunner.createIndex(
      'deals',
      new TableIndex({ name: 'IDX_deals_conversationId', columnNames: ['conversationId'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('deals', 'IDX_deals_conversationId');
    await queryRunner.dropIndex('deals', 'IDX_deals_contactId');
    await queryRunner.query(`ALTER TABLE "deals" DROP COLUMN "conversationId"`);
    await queryRunner.query(`ALTER TABLE "deals" DROP COLUMN "contactId"`);
  }
}

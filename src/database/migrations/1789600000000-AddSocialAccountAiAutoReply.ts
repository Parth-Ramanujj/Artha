import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { portableColumn } from '../portable-table';

/** Per-account switch: the business's AI chatbot answers Instagram/Facebook DMs that no rule answered. */
export class AddSocialAccountAiAutoReply1789600000000 implements MigrationInterface {
  name = 'AddSocialAccountAiAutoReply1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('social_accounts', 'aiAutoReply')) return;
    await queryRunner.addColumn(
      'social_accounts',
      new TableColumn(portableColumn(queryRunner, { name: 'aiAutoReply', type: 'boolean', default: false })),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('social_accounts', 'aiAutoReply');
  }
}

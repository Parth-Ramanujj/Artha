import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { portableColumn } from '../portable-table';

/** Lets an auto-reply rule answer comments, Instagram/Facebook DMs, or both. Existing rules stay on comments. */
export class AddRuleAppliesTo1789500000000 implements MigrationInterface {
  name = 'AddRuleAppliesTo1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('social_comment_rules', 'appliesTo')) return;
    await queryRunner.addColumn(
      'social_comment_rules',
      new TableColumn(
        portableColumn(queryRunner, { name: 'appliesTo', type: 'varchar', length: '20', default: "'comments'" }),
      ),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('social_comment_rules', 'appliesTo');
  }
}

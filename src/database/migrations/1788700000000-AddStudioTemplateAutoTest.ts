import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Message Studio: a test phone and the templates waiting to be sent to it once Meta approves them. */
export class AddStudioTemplateAutoTest1788700000000 implements MigrationInterface {
  name = 'AddStudioTemplateAutoTest1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('studio_settings', 'testPhone'))) {
      await queryRunner.addColumn(
        'studio_settings',
        new TableColumn({ name: 'testPhone', type: 'varchar', length: '20', isNullable: true }),
      );
    }
    if (!(await queryRunner.hasColumn('studio_settings', 'autoTests'))) {
      await queryRunner.addColumn(
        'studio_settings',
        new TableColumn({ name: 'autoTests', type: 'text', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('studio_settings', 'autoTests')) {
      await queryRunner.dropColumn('studio_settings', 'autoTests');
    }
    if (await queryRunner.hasColumn('studio_settings', 'testPhone')) {
      await queryRunner.dropColumn('studio_settings', 'testPhone');
    }
  }
}

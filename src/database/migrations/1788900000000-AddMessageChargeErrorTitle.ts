import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Keeps Meta's own error text for a failed message, so the dashboard can say why it never arrived. */
export class AddMessageChargeErrorTitle1788900000000 implements MigrationInterface {
  name = 'AddMessageChargeErrorTitle1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('message_charges')) &&
      !(await queryRunner.hasColumn('message_charges', 'errorTitle'))
    ) {
      await queryRunner.addColumn(
        'message_charges',
        new TableColumn({ name: 'errorTitle', type: 'varchar', length: '300', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('message_charges', 'errorTitle')) {
      await queryRunner.dropColumn('message_charges', 'errorTitle');
    }
  }
}

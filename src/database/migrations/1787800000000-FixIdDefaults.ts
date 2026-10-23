import { MigrationInterface, QueryRunner } from 'typeorm';

// Tables created by synchronize/earlier migrations can have a NOT NULL id with no DB default, so
// inserts that rely on the DB (businesses, etc.) fail with a null id. Adding a default never changes
// inserts that pass an id explicitly. Postgres only; SQLite is untouched.
export class FixIdDefaults1787800000000 implements MigrationInterface {
  name = 'FixIdDefaults1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.dataSource.options.type !== 'postgres') return;
    await queryRunner.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT table_name, data_type FROM information_schema.columns
          WHERE table_schema = current_schema() AND column_name = 'id'
            AND is_nullable = 'NO' AND column_default IS NULL AND is_identity = 'NO'
        LOOP
          IF r.data_type = 'uuid' THEN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', r.table_name);
          ELSIF r.data_type IN ('character varying', 'text') THEN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()::text', r.table_name);
          END IF;
        END LOOP;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Defaults are harmless to keep; no rollback.
  }
}

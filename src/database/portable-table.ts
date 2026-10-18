import { QueryRunner, Table, TableColumnOptions, TableOptions } from 'typeorm';

/**
 * Column options written for SQLite, adjusted so the same migration also runs on PostgreSQL: there is
 * no `datetime` type, and a "generated" varchar id renders with no type at all (a syntax error) and no
 * DB default, so ids get `gen_random_uuid()` like the hand-written migrations. SQLite is left unchanged
 * so databases that already ran these migrations stay identical to new ones.
 */
export function portableColumn(queryRunner: QueryRunner, column: TableColumnOptions): TableColumnOptions {
  if (queryRunner.connection.options.type !== 'postgres') return column;
  const portable: TableColumnOptions = { ...column };
  if (portable.type === 'datetime') portable.type = 'timestamp';
  if (portable.isPrimary && portable.generationStrategy === 'uuid') {
    portable.isGenerated = false;
    portable.generationStrategy = undefined;
    portable.default = 'gen_random_uuid()';
  }
  return portable;
}

export function portableTable(queryRunner: QueryRunner, options: TableOptions): Table {
  return new Table({ ...options, columns: (options.columns ?? []).map(c => portableColumn(queryRunner, c)) });
}

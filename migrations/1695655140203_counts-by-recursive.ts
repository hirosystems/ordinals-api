/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('counts_by_recursive', {
    recursive: {
      type: 'boolean',
      notNull: true,
      primaryKey: true,
    },
    count: {
      type: 'bigint',
      notNull: true,
      default: 1,
    },
  });
  pgm.sql(`
    INSERT INTO counts_by_recursive (recursive, count)
    (SELECT recursive, COUNT(*) AS count FROM inscriptions GROUP BY recursive)
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('counts_by_recursive');
}

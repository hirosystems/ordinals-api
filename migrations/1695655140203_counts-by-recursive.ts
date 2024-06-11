/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('counts_by_recursive', {
    recursive: {
      type: 'boolean',
      primaryKey: true,
    },
    count: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
  });
}

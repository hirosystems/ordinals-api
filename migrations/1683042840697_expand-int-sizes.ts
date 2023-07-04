/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.alterColumn('json_contents', 'id', { type: 'bigint' });
  pgm.alterColumn('json_contents', 'inscription_id', { type: 'bigint' });
}

export function down(pgm: MigrationBuilder): void {
  pgm.alterColumn('json_contents', 'id', { type: 'int' });
  pgm.alterColumn('json_contents', 'inscription_id', { type: 'int' });
}

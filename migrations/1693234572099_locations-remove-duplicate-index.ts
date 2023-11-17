/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('locations', ['inscription_id'], { ifExists: true });
}

export function down(pgm: MigrationBuilder): void {
  pgm.createIndex('locations', ['inscription_id'], { ifNotExists: true });
}

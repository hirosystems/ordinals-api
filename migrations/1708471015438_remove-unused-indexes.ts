/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('locations', ['prev_output']);
  pgm.dropIndex('locations', ['address']);
  pgm.dropIndex('current_locations', ['block_height']);
  pgm.dropIndex('inscription_recursions', ['ref_inscription_genesis_id']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.createIndex('locations', ['prev_output']);
  pgm.createIndex('locations', ['address']);
  pgm.createIndex('current_locations', ['block_height']);
  pgm.createIndex('inscription_recursions', ['ref_inscription_genesis_id']);
}

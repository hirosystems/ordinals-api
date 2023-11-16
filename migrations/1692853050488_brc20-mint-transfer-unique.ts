/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('brc20_transfers', ['inscription_id']);
  pgm.createIndex('brc20_transfers', ['inscription_id'], { unique: true });
  pgm.dropIndex('brc20_mints', ['inscription_id']);
  pgm.createIndex('brc20_mints', ['inscription_id'], { unique: true });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('brc20_transfers', ['inscription_id'], { unique: true });
  pgm.createIndex('brc20_transfers', ['inscription_id']);
  pgm.dropIndex('brc20_mints', ['inscription_id'], { unique: true });
  pgm.createIndex('brc20_mints', ['inscription_id']);
}

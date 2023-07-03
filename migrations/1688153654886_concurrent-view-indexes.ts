/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createIndex('chain_tip', ['block_height'], { unique: true });
  pgm.createIndex('mime_type_counts', ['mime_type'], { unique: true });
  pgm.createIndex('sat_rarity_counts', ['sat_rarity'], { unique: true });
  pgm.createIndex('inscription_count', ['count'], { unique: true });
}

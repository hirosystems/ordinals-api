/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('counts_by_block', {
    block_height: {
      type: 'bigint',
      primaryKey: true,
    },
    block_hash: {
      type: 'text',
      notNull: true,
    },
    inscription_count: {
      type: 'bigint',
      notNull: true,
    },
    inscription_count_accum: {
      type: 'bigint',
      notNull: true,
    },
    timestamp: {
      type: 'timestamptz',
      notNull: true,
    },
  });
  pgm.createIndex('counts_by_block', ['block_hash']);
}

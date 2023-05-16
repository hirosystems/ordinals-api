/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('inscriptions_per_block', {
    block_height: {
      type: 'bigint',
      primaryKey: true,
    },
    inscription_count: {
      type: 'bigint',
      notNull: true,
    },
    inscription_count_total: {
      type: 'bigint',
      notNull: true,
    },
  });
}

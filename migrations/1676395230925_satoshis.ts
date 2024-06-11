/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('satoshis', {
    ordinal_number: {
      type: 'numeric',
      primaryKey: true,
    },
    rarity: {
      type: 'text',
      notNull: true,
    },
    coinbase_height: {
      type: 'bigint',
      notNull: true,
    },
  });
  pgm.createIndex('satoshis', ['rarity']);
}

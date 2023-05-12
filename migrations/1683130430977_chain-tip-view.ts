/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropTable('chain_tip');
  pgm.createMaterializedView(
    'chain_tip',
    { data: true },
    // Set block height 767430 (inscription #0 genesis) as default.
    `SELECT GREATEST(MAX(block_height), 767430) AS block_height FROM locations`
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropMaterializedView('chain_tip');
  pgm.createTable('chain_tip', {
    id: {
      type: 'bool',
      primaryKey: true,
      default: true,
    },
    block_height: {
      type: 'int',
      notNull: true,
      default: 767430, // First inscription block height
    },
    inscription_count: {
      type: 'int',
      notNull: true,
      default: 0,
    },
  });
  // Ensure only a single row can exist
  pgm.addConstraint('chain_tip', 'chain_tip_one_row', 'CHECK(id)');
  // Create the single row
  pgm.sql('INSERT INTO chain_tip VALUES(DEFAULT)');
}

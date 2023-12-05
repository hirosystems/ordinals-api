/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropMaterializedView('chain_tip');
  pgm.createTable('chain_tip', {
    id: {
      type: 'bool',
      primaryKey: true,
      default: true,
    },
    block_height: {
      type: 'bigint',
      notNull: true,
      // Set block height 767430 (inscription #0 genesis) as default.
      default: 767430,
    },
  });
  pgm.addConstraint('chain_tip', 'chain_tip_one_row', 'CHECK(id)');
  pgm.sql(`
    INSERT INTO chain_tip (block_height) (
      SELECT GREATEST(MAX(block_height), 767430) AS block_height FROM locations
    )
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('chain_tip');
  pgm.createMaterializedView(
    'chain_tip',
    { data: true },
    // Set block height 767430 (inscription #0 genesis) as default.
    `SELECT GREATEST(MAX(block_height), 767430) AS block_height FROM locations`
  );
  pgm.createIndex('chain_tip', ['block_height'], { unique: true });
}

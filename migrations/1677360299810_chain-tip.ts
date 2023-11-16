/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createMaterializedView(
    'chain_tip',
    { data: true },
    // Set block height 767430 (inscription #0 genesis) as default.
    `SELECT GREATEST(MAX(block_height), 767430) AS block_height FROM locations`
  );
  pgm.createIndex('chain_tip', ['block_height'], { unique: true });
}

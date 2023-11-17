/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createMaterializedView(
    'brc20_supplies',
    {},
    `
      SELECT brc20_deploy_id, SUM(amount) as minted_supply, MAX(block_height) as block_height
      FROM brc20_mints
      GROUP BY brc20_deploy_id
    `
  );
  pgm.createIndex('brc20_supplies', ['brc20_deploy_id'], { unique: true });
}

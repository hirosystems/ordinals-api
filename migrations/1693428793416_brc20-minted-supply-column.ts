/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('brc20_deploys', {
    minted_supply: {
      type: 'numeric',
      default: 0,
    },
  });
  pgm.sql(`
    UPDATE brc20_deploys AS d
    SET minted_supply = (
      SELECT COALESCE(SUM(amount), 0) AS minted_supply
      FROM brc20_mints
      WHERE brc20_deploy_id = d.id
    )
  `);
  pgm.dropMaterializedView('brc20_supplies');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn('brc20_deploys', ['minted_supply']);
  pgm.createMaterializedView(
    'brc20_supplies',
    { data: true },
    `
      SELECT brc20_deploy_id, SUM(amount) as minted_supply, MAX(block_height) as block_height
      FROM brc20_mints
      GROUP BY brc20_deploy_id
    `
  );
  pgm.createIndex('brc20_supplies', ['brc20_deploy_id'], { unique: true });
}

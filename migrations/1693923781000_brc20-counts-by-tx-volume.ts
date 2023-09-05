/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('brc20_deploys', {
    tx_count: {
      type: 'numeric',
      default: 0,
    },
  });
  pgm.sql(`
    UPDATE brc20_deploys AS d
    SET tx_count = (
      SELECT COALESCE(COUNT(*), 0) AS tx_count
      FROM brc20_events
      WHERE brc20_deploy_id = d.id
    )
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn('brc20_deploys', 'tx_count');
}

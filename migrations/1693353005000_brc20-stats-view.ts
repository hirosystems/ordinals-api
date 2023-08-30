/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createMaterializedView(
    'brc20_stats',
    { data: true },
    `
      WITH balances AS (
        SELECT brc20_deploy_id, address, SUM(avail_balance + trans_balance) AS balance
        FROM brc20_balances
        GROUP BY brc20_deploy_id, address
      ), holders AS (
        SELECT brc20_deploy_id, COUNT(*) AS count
        FROM balances
        WHERE balance > 0
        GROUP BY brc20_deploy_id
      ), transactions AS (
        SELECT brc20_deploy_id, COUNT(*) AS count
        FROM brc20_events
        GROUP BY brc20_deploy_id
      )
      SELECT
        brc20_deploy_id,
        t.count AS tx_count,
        h.count AS holder_count
      FROM transactions AS t
      LEFT JOIN holders AS h USING (brc20_deploy_id)
    `
  );
  pgm.createIndex('brc20_stats', ['brc20_deploy_id'], { unique: true });
}

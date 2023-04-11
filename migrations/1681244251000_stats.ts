/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createMaterializedView(
    'stats_inscriptions_per_block',
    {
      data: true,
    },
    `SELECT block_height,
      COUNT(*) AS count,
      SUM(COUNT(*)) OVER (ORDER BY block_height) AS scan_count
    FROM locations
    WHERE genesis = true
    GROUP BY block_height
    ORDER BY block_height ASC`
  );

  // unique index allows concurrent materialized view refresh
  pgm.createIndex('stats_inscriptions_per_block', ['block_height'], { unique: true });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropMaterializedView('stats_inscriptions_per_block');
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createMaterializedView(
    'sat_rarity_counts',
    { data: true },
    `
    SELECT sat_rarity, COUNT(*) AS count
    FROM inscriptions AS i
    INNER JOIN locations AS loc ON loc.inscription_id = i.id
    WHERE loc.current = TRUE
    GROUP BY sat_rarity
    `
  );
}

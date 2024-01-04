/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropConstraint('locations', 'locations_output_offset_unique');
  pgm.createIndex('locations', ['output', 'offset']);
  pgm.createConstraint(
    'locations',
    'locations_inscription_id_block_height_tx_index_unique',
    'UNIQUE(inscription_id, block_height, tx_index)'
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropConstraint('locations', 'locations_inscription_id_block_height_tx_index_unique');
  pgm.dropIndex('locations', ['output', 'offset']);
  // Modify any repeated offsets slightly so we can re-add the unique constraint. This is mostly for
  // unit testing purposes.
  pgm.sql(`
    WITH duplicates AS (
      SELECT
        id, output, "offset", ROW_NUMBER() OVER (PARTITION BY output, "offset" ORDER BY id) as rn
      FROM locations
    )
    UPDATE locations
    SET "offset" = duplicates."offset" + rn - 1
    FROM duplicates
    WHERE locations.id = duplicates.id
    AND rn > 1
  `);
  pgm.createConstraint('locations', 'locations_output_offset_unique', 'UNIQUE(output, "offset")');
}

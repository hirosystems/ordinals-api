/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('locations', ['output']); // Duplicate index
  pgm.createIndex('locations', ['inscription_id'], { ifNotExists: true });

  pgm.createMaterializedView(
    'genesis_locations',
    {},
    `SELECT DISTINCT ON(inscription_id) * FROM locations ORDER BY inscription_id, block_height ASC`
  );
  pgm.createIndex('genesis_locations', ['inscription_id'], { unique: true });

  pgm.createMaterializedView(
    'current_locations',
    {},
    `SELECT DISTINCT ON(inscription_id) * FROM locations ORDER BY inscription_id, block_height DESC`
  );
  pgm.createIndex('current_locations', ['inscription_id'], { unique: true });
}

export function down(pgm: MigrationBuilder): void {
  pgm.createIndex('locations', ['output']);
  pgm.dropIndex('locations', ['inscription_id']);
  pgm.dropMaterializedView('genesis_locations');
  pgm.dropMaterializedView('current_locations');
}

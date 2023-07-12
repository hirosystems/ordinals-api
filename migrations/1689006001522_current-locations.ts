/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('current_locations', {
    inscription_id: {
      type: 'bigint',
      notNull: true,
    },
    location_id: {
      type: 'bigint',
      notNull: true,
    },
    block_height: {
      type: 'bigint',
      notNull: true,
    },
    tx_index: {
      type: 'bigint',
      notNull: true,
    },
  });
  pgm.createConstraint(
    'current_locations',
    'current_locations_inscription_id_unique',
    'UNIQUE(inscription_id)'
  );
  pgm.createIndex('current_locations', ['location_id']);
  pgm.createIndex('current_locations', ['block_height']);
}

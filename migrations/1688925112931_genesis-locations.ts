/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('genesis', {
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
  });
  pgm.createConstraint('genesis', 'genesis_inscription_id_unique', 'UNIQUE(inscription_id)');
  pgm.createIndex('genesis', ['location_id']);

  pgm.createTable('current', {
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
  });
  pgm.createConstraint('current', 'current_inscription_id_unique', 'UNIQUE(inscription_id)');
  pgm.createIndex('current', ['location_id']);
}

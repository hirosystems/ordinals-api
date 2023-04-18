/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('locations', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    inscription_id: {
      type: 'int',
      notNull: true,
    },
    block_height: {
      type: 'int',
      notNull: true,
    },
    block_hash: {
      type: 'text',
      notNull: true,
    },
    tx_id: {
      type: 'text',
      notNull: true,
    },
    address: {
      type: 'text',
    },
    output: {
      type: 'text',
      notNull: true,
    },
    offset: {
      type: 'numeric',
    },
    value: {
      type: 'numeric',
    },
    sat_ordinal: {
      type: 'numeric',
      notNull: true,
    },
    sat_rarity: {
      type: 'text',
      notNull: true,
    },
    sat_coinbase_height: {
      type: 'int',
      notNull: true,
    },
    timestamp: {
      type: 'timestamptz',
      notNull: true,
    },
    genesis: {
      type: 'boolean',
      default: true,
      notNull: true,
    },
    current: {
      type: 'boolean',
      default: true,
      notNull: true,
    },
  });
  pgm.createConstraint(
    'locations',
    'locations_inscription_id_fk',
    'FOREIGN KEY(inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'locations',
    'locations_inscription_id_block_height_unique',
    'UNIQUE(inscription_id, block_height)'
  );
  pgm.createIndex('locations', ['block_height']);
  pgm.createIndex('locations', ['block_hash']);
  pgm.createIndex('locations', ['address']);
  pgm.createIndex('locations', ['output']);
  pgm.createIndex('locations', ['sat_ordinal']);
  pgm.createIndex('locations', ['sat_rarity']);
  pgm.createIndex('locations', ['sat_coinbase_height']);
  pgm.createIndex('locations', ['timestamp']);
}

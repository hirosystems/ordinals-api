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
      notNull: true,
    },
    output: {
      type: 'text',
      notNull: true,
    },
    offset: {
      type: 'bigint',
      notNull: true,
    },
    value: {
      type: 'bigint',
      notNull: true,
    },
    sat_ordinal: {
      type: 'bigint',
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
    'locations_inscription_id_block_hash_unique',
    'UNIQUE(inscription_id, block_hash)'
  );
  pgm.createIndex('locations', ['block_height']);
  pgm.createIndex('locations', ['block_hash']);
  pgm.createIndex('locations', ['address']);
  pgm.createIndex('locations', ['output']);
}

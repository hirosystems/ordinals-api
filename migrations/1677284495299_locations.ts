/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('transfer_type', ['transferred', 'spent_in_fees', 'burnt']);
  pgm.createTable('locations', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    inscription_id: {
      type: 'bigint',
    },
    genesis_id: {
      type: 'text',
      notNull: true,
    },
    block_height: {
      type: 'bigint',
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
    tx_index: {
      type: 'bigint',
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
    prev_output: {
      type: 'text',
    },
    prev_offset: {
      type: 'numeric',
    },
    value: {
      type: 'numeric',
    },
    block_transfer_index: {
      type: 'int',
    },
    transfer_type: {
      type: 'transfer_type',
      notNull: true,
    },
    timestamp: {
      type: 'timestamptz',
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
    'locations_unique',
    'UNIQUE(inscription_id, block_height, tx_index)'
  );
  pgm.createIndex('locations', ['output', 'offset']);
  pgm.createIndex('locations', ['timestamp']);
  pgm.createIndex('locations', [
    'genesis_id',
    { name: 'block_height', sort: 'DESC' },
    { name: 'tx_index', sort: 'DESC' },
  ]);
  pgm.createIndex('locations', [
    { name: 'block_height', sort: 'DESC' },
    { name: 'tx_index', sort: 'DESC' },
  ]);
  pgm.addIndex('locations', ['block_height', { name: 'block_transfer_index', sort: 'DESC' }]);
  pgm.addIndex('locations', ['block_hash', { name: 'block_transfer_index', sort: 'DESC' }]);
}

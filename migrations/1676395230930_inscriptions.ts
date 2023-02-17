/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('inscriptions', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    inscription_id: {
      type: 'text',
      notNull: true,
    },
    offset: {
      type: 'int',
      notNull: true,
    },
    block_height: {
      type: 'int',
      notNull: true,
    },
    block_hash: {
      type: 'bytea',
      notNull: true,
    },
    tx_id: {
      type: 'bytea',
      notNull: true,
    },
    address: {
      type: 'text',
      notNull: true,
    },
    sat_ordinal: {
      type: 'numeric',
      notNull: true,
    },
    sat_point: {
      type: 'text',
      notNull: true,
    },
    fee: {
      type: 'int',
      notNull: true,
    },
    content_type: {
      type: 'text',
      notNull: true,
    },
    content_length: {
      type: 'int',
      notNull: true,
    },
    content: {
      type: 'bytea',
      notNull: true,
    },
    timestamp: {
      type: 'timestamptz',
      notNull: true,
    },
  });
  pgm.createIndex('inscriptions', ['inscription_id']);
  pgm.createIndex('inscriptions', ['sat_ordinal']);
  pgm.createIndex('inscriptions', [{ name: 'block_height', sort: 'DESC' }]);
  pgm.createIndex('inscriptions', ['block_hash']);
  pgm.createIndex('inscriptions', ['address']);
}

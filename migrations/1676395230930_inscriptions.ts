/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('inscriptions', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    genesis_id: {
      type: 'text',
      notNull: true,
    },
    number: {
      type: 'bigint',
      notNull: true,
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
      type: 'bigint',
      notNull: true,
    },
    mime_type: {
      type: 'text',
      notNull: true,
    },
    content_type: {
      type: 'text',
      notNull: true,
    },
    content_length: {
      type: 'bigint',
      notNull: true,
    },
    content: {
      type: 'bytea',
      notNull: true,
    },
    fee: {
      type: 'numeric',
      notNull: true,
    },
    curse_type: {
      type: 'text',
    },
  });
  pgm.createConstraint('inscriptions', 'inscriptions_number_unique', 'UNIQUE(number)');
  pgm.createIndex('inscriptions', ['genesis_id']);
  pgm.createIndex('inscriptions', ['mime_type']);
  pgm.createIndex('inscriptions', ['sat_ordinal']);
  pgm.createIndex('inscriptions', ['sat_rarity']);
  pgm.createIndex('inscriptions', ['sat_coinbase_height']);
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('inscriptions', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    genesis_id: {
      type: 'text',
      notNull: true,
    },
    number: {
      type: 'int',
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
      type: 'int',
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
  });
  pgm.createConstraint('inscriptions', 'inscriptions_number_unique', 'UNIQUE(number)');
  pgm.createIndex('inscriptions', ['genesis_id']);
  pgm.createIndex('inscriptions', ['mime_type']);
}

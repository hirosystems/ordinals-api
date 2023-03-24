/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('json_contents', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    inscription_id: {
      type: 'int',
      notNull: true,
    },
    p: {
      type: 'text',
      notNull: true,
    },
    op: {
      type: 'text',
      notNull: true,
    },
    content: {
      type: 'jsonb',
      notNull: true,
    },
  });
  pgm.createConstraint(
    'json_contents',
    'json_contents_inscription_id_fk',
    'FOREIGN KEY(inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'json_contents',
    'json_contents_inscription_id_unique',
    'UNIQUE(inscription_id)'
  );
  pgm.createIndex('json_contents', ['p']);
  pgm.createIndex('json_contents', ['op']);
}

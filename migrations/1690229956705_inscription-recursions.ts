/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('inscription_recursions', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    inscription_id: {
      type: 'bigint',
      notNull: true,
    },
    ref_inscription_id: {
      type: 'bigint',
      notNull: true,
    },
  });
  pgm.createConstraint(
    'inscription_recursions',
    'locations_inscription_id_fk',
    'FOREIGN KEY(inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'inscription_recursions',
    'locations_ref_inscription_id_fk',
    'FOREIGN KEY(ref_inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'inscription_recursions',
    'inscriptions_inscription_id_ref_inscription_id_unique',
    'UNIQUE(inscription_id, ref_inscription_id)'
  );
  pgm.createIndex('inscription_recursions', ['ref_inscription_id']);

  // Add columns to `inscriptions` table.
  pgm.addColumn('inscriptions', {
    recursive: {
      type: 'boolean',
      default: false,
    },
  });
  pgm.createIndex('inscriptions', ['recursive'], { where: 'recursive = TRUE' });
}

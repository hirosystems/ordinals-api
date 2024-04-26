/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('inscription_recursions', {
    genesis_id: {
      type: 'text',
      notNull: true,
    },
    ref_genesis_id: {
      type: 'text',
      notNull: true,
    },
  });
  pgm.createConstraint('inscription_recursions', 'inscription_recursions_pkey', {
    primaryKey: ['genesis_id', 'ref_genesis_id'],
  });
  pgm.createConstraint(
    'inscription_recursions',
    'inscription_recursions_genesis_id_fk',
    'FOREIGN KEY(genesis_id) REFERENCES inscriptions(genesis_id) ON DELETE CASCADE'
  );
}

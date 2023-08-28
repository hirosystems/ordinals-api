/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('inscription_recursions', {
    ref_inscription_genesis_id: {
      type: 'text',
    },
  });
  pgm.sql(`
    UPDATE inscription_recursions AS ir
    SET ref_inscription_genesis_id = (
      SELECT genesis_id FROM inscriptions WHERE id = ir.ref_inscription_id
    )
  `);
  pgm.alterColumn('inscription_recursions', 'ref_inscription_genesis_id', { notNull: true });
  pgm.alterColumn('inscription_recursions', 'ref_inscription_id', { allowNull: true });

  pgm.createIndex('inscription_recursions', ['ref_inscription_genesis_id']);
  pgm.createIndex('inscription_recursions', ['ref_inscription_id'], {
    where: 'ref_inscription_id IS NULL',
    name: 'inscription_recursions_ref_inscription_id_null_index',
  });
  pgm.dropConstraint(
    'inscription_recursions',
    'inscriptions_inscription_id_ref_inscription_id_unique'
  );
  pgm.createConstraint(
    'inscription_recursions',
    'inscription_recursions_unique',
    'UNIQUE(inscription_id, ref_inscription_genesis_id)'
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropConstraint('inscription_recursions', 'inscription_recursions_unique');
  pgm.dropIndex('inscription_recursions', ['ref_inscription_genesis_id']);
  pgm.dropColumn('inscription_recursions', 'ref_inscription_genesis_id');
  pgm.dropIndex('inscription_recursions', ['ref_inscription_id'], {
    name: 'inscription_recursions_ref_inscription_id_null_index',
  });
  pgm.sql(`DELETE FROM inscription_recursions WHERE ref_inscription_id IS NULL`);
  pgm.alterColumn('inscription_recursions', 'ref_inscription_id', { notNull: true });
  pgm.createConstraint(
    'inscription_recursions',
    'inscriptions_inscription_id_ref_inscription_id_unique',
    'UNIQUE(inscription_id, ref_inscription_id)'
  );
}

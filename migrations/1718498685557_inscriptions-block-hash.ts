/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('inscriptions', {
    block_hash: {
      type: 'text',
    },
  });
  pgm.sql(`
    UPDATE inscriptions SET block_hash = (
      SELECT block_hash FROM locations AS l WHERE l.ordinal_number = ordinal_number LIMIT 1
    )  
  `);
  pgm.alterColumn('inscriptions', 'block_hash', { notNull: true });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn('inscriptions', 'block_hash');
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('inscriptions', {
    classic_number: {
      type: 'bigint',
    },
  });
  pgm.sql(`UPDATE inscriptions SET classic_number = number`);
  pgm.alterColumn('inscriptions', 'classic_number', { notNull: true });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn('inscriptions', 'classic_number');
}

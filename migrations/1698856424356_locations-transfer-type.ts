/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('transfer_type', ['transferred', 'spent_in_fees', 'burnt']);
  pgm.addColumn('locations', {
    transfer_type: {
      type: 'transfer_type',
    },
  });
  pgm.sql(`UPDATE locations SET transfer_type = 'transferred'`);
  pgm.alterColumn('locations', 'transfer_type', { notNull: true });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn('locations', ['transfer_type']);
  pgm.dropType('transfer_type');
}

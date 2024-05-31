/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createIndex('current_locations', ['block_height', 'tx_index']);
  pgm.dropConstraint('current_locations', 'current_locations_locations_fk');
  pgm.dropConstraint('inscription_transfers', 'inscription_transfers_locations_fk');
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('current_locations', ['block_height', 'tx_index']);
  pgm.createConstraint(
    'current_locations',
    'current_locations_locations_fk',
    'FOREIGN KEY(ordinal_number, block_height, tx_index) REFERENCES locations(ordinal_number, block_height, tx_index) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'inscription_transfers',
    'inscription_transfers_locations_fk',
    'FOREIGN KEY(ordinal_number, block_height, tx_index) REFERENCES locations(ordinal_number, block_height, tx_index) ON DELETE CASCADE'
  );
}

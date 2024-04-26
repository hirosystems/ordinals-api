/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('current_locations', {
    ordinal_number: {
      type: 'numeric',
      notNull: true,
    },
    block_height: {
      type: 'bigint',
      notNull: true,
    },
    tx_index: {
      type: 'bigint',
      notNull: true,
    },
    address: {
      type: 'text',
    },
  });
  pgm.createConstraint(
    'current_locations',
    'current_locations_locations_fk',
    'FOREIGN KEY(ordinal_number, block_height, tx_index) REFERENCES locations(ordinal_number, block_height, tx_index) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'locations',
    'locations_satoshis_fk',
    'FOREIGN KEY(ordinal_number) REFERENCES satoshis(ordinal_number) ON DELETE CASCADE'
  );
  pgm.createIndex('current_locations', ['ordinal_number'], { unique: true });
  pgm.createIndex('current_locations', ['address']);
}

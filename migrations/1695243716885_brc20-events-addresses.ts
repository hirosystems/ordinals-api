/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('brc20_events', {
    address: {
      type: 'text',
    },
    from_address: {
      type: 'text',
    },
  });
  pgm.createIndex('brc20_events', ['address']);
  pgm.createIndex('brc20_events', ['from_address']);
  pgm.sql(`
    UPDATE brc20_events
    SET address = (SELECT address FROM locations WHERE id = brc20_events.genesis_location_id)
  `);
  pgm.sql(`
    UPDATE brc20_events
    SET from_address = (SELECT from_address FROM brc20_transfers WHERE id = brc20_events.transfer_id)
    WHERE operation = 'transfer_send'
  `);
  pgm.alterColumn('brc20_events', 'address', { notNull: true });
  pgm.dropIndex('brc20_events', ['genesis_location_id']); // Covered by the unique index.
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('brc20_events', ['address']);
  pgm.dropIndex('brc20_events', ['from_address']);
  pgm.dropColumns('brc20_events', ['address', 'from_address']);
  pgm.createIndex('brc20_events', ['genesis_location_id']);
}

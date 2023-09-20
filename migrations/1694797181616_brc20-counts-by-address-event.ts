/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('brc20_counts_by_address_event_type', {
    address: {
      type: 'text',
      notNull: true,
      primaryKey: true,
    },
    deploy: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    mint: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    transfer: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    transfer_send: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
  });
  pgm.sql(`
    INSERT INTO brc20_counts_by_address_event_type (address, deploy) (
      SELECT address, COUNT(*) AS deploy FROM brc20_deploys GROUP BY address
    ) ON CONFLICT (address) DO UPDATE SET deploy = EXCLUDED.deploy
  `);
  pgm.sql(`
    INSERT INTO brc20_counts_by_address_event_type (address, mint) (
      SELECT address, COUNT(*) AS mint FROM brc20_mints GROUP BY address
    ) ON CONFLICT (address) DO UPDATE SET mint = EXCLUDED.mint
  `);
  pgm.sql(`
    INSERT INTO brc20_counts_by_address_event_type (address, transfer) (
      SELECT from_address AS address, COUNT(*) AS transfer FROM brc20_transfers GROUP BY from_address
    ) ON CONFLICT (address) DO UPDATE SET transfer = EXCLUDED.transfer
  `);
  pgm.sql(`
    INSERT INTO brc20_counts_by_address_event_type (address, transfer_send) (
      SELECT from_address AS address, COUNT(*) AS transfer_send
      FROM brc20_transfers
      WHERE to_address IS NOT NULL
      GROUP BY from_address
    ) ON CONFLICT (address) DO UPDATE SET transfer_send = EXCLUDED.transfer_send
  `);
  pgm.sql(`
    INSERT INTO brc20_counts_by_address_event_type (address, transfer_send) (
      SELECT to_address AS address, COUNT(*) AS transfer_send
      FROM brc20_transfers
      WHERE to_address <> from_address
      GROUP BY to_address
    ) ON CONFLICT (address) DO UPDATE SET transfer_send = brc20_counts_by_address_event_type.transfer_send + EXCLUDED.transfer_send
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('brc20_counts_by_address_event_type');
}

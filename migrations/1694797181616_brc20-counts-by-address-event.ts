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
}

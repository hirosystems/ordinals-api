/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('brc20_counts_by_address_operation', {
    address: {
      type: 'text',
      notNull: true,
    },
    operation: {
      type: 'brc20_operation',
      notNull: true,
    },
    count: {
      type: 'bigint',
      notNull: true,
      default: 1,
    },
  });
  pgm.createConstraint(
    'brc20_counts_by_address_operation',
    'brc20_counts_by_address_operation_pkey',
    { primaryKey: ['address', 'operation'] }
  );
}

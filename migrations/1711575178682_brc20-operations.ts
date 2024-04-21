/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('brc20_operation', [
    'deploy',
    'mint',
    'transfer',
    'transfer_send',
    'transfer_receive',
  ]);
  pgm.createTable('brc20_operations', {
    genesis_id: {
      type: 'string',
      notNull: true,
    },
    brc20_token_ticker: {
      type: 'string',
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
    avail_balance: {
      type: 'numeric',
      notNull: true,
    },
    trans_balance: {
      type: 'numeric',
      notNull: true,
    },
    operation: {
      type: 'brc20_operation',
      notNull: true,
    },
  });
  pgm.createConstraint(
    'brc20_operations',
    'brc20_operations_unique',
    'UNIQUE(genesis_id, operation)'
  );
}

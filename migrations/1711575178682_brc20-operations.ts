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
    ticker: {
      type: 'string',
      notNull: true,
    },
    operation: {
      type: 'brc20_operation',
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
      notNull: true,
    },
    // Only used when operation is `transfer_send`; used to optimize activity lookup for
    // receiving addresses.
    to_address: {
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
  });
  pgm.createConstraint('brc20_operations', 'brc20_operations_pkey', {
    primaryKey: ['genesis_id', 'operation'],
  });
  pgm.createConstraint(
    'brc20_operations',
    'brc20_operations_ticker_fk',
    'FOREIGN KEY(ticker) REFERENCES brc20_tokens(ticker) ON DELETE CASCADE'
  );
  pgm.createIndex('brc20_operations', ['operation']);
  pgm.createIndex('brc20_operations', ['ticker', 'address']);
  pgm.createIndex('brc20_operations', [
    { name: 'block_height', sort: 'DESC' },
    { name: 'tx_index', sort: 'DESC' },
  ]);
  pgm.createIndex('brc20_operations', ['address', 'to_address']);
}

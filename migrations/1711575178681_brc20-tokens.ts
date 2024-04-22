/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('brc20_tokens', {
    ticker: {
      type: 'text',
      primaryKey: true,
    },
    genesis_id: {
      type: 'string',
      notNull: true,
    },
    block_height: {
      type: 'bigint',
      notNull: true,
    },
    tx_id: {
      type: 'text',
      notNull: true,
    },
    address: {
      type: 'text',
      notNull: true,
    },
    max: {
      type: 'numeric',
      notNull: true,
    },
    limit: {
      type: 'numeric',
    },
    decimals: {
      type: 'int',
      notNull: true,
    },
    self_mint: {
      type: 'boolean',
      default: 'false',
      notNull: true,
    },
    minted_supply: {
      type: 'numeric',
      default: 0,
    },
    burned_supply: {
      type: 'numeric',
      default: 0,
    },
    tx_count: {
      type: 'bigint',
      default: 0,
    },
  });
  pgm.createIndex('brc20_tokens', ['genesis_id']);
  pgm.createIndex('brc20_tokens', ['block_height']);
}

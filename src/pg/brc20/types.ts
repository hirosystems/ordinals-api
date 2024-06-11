import { PgNumeric } from '@hirosystems/api-toolkit';

export type DbBrc20TokenInsert = {
  ticker: string;
  genesis_id: string;
  block_height: number;
  tx_id: string;
  address: string;
  max: PgNumeric;
  limit: PgNumeric;
  decimals: PgNumeric;
  self_mint: boolean;
};

export enum DbBrc20Operation {
  deploy = 'deploy',
  mint = 'mint',
  transfer = 'transfer',
  transferSend = 'transfer_send',
  transferReceive = 'transfer_receive',
}

export type DbBrc20OperationInsert = {
  genesis_id: string;
  ticker: string;
  block_height: number;
  tx_index: number;
  address: string;
  avail_balance: PgNumeric;
  trans_balance: PgNumeric;
  operation: DbBrc20Operation;
};

export type DbBrc20Token = {
  id: string;
  genesis_id: string;
  number: string;
  block_height: string;
  tx_id: string;
  address: string;
  ticker: string;
  max: string;
  limit?: string;
  decimals: number;
  timestamp: number;
  minted_supply: string;
  tx_count: string;
  self_mint: boolean;
};

export type DbBrc20TokenWithSupply = DbBrc20Token & {
  minted_supply: string;
  holders: string;
};

export type DbBrc20Holder = {
  address: string;
  total_balance: string;
  decimals: number;
};

export type DbBrc20Balance = {
  ticker: string;
  decimals: number;
  avail_balance: string;
  trans_balance: string;
  total_balance: string;
};

export enum DbBrc20EventOperation {
  deploy = 'deploy',
  mint = 'mint',
  transfer = 'transfer',
  transferSend = 'transfer_send',
}

export type DbBrc20Activity = {
  ticker: string;
  avail_balance: string;
  trans_balance: string;
  deploy_decimals: number;
  deploy_max: string;
  deploy_limit: string | null;
  operation: DbBrc20EventOperation;
  output: string;
  offset: string;
  brc20_deploy_id: string;
  inscription_id: string;
  block_height: string;
  block_hash: string;
  tx_id: string;
  address: string;
  to_address: string | null;
  timestamp: number;
};

import { PgNumeric } from '@hirosystems/api-toolkit';
import { DbLocation } from '../types';

export type DbBrc20ScannedInscription = DbLocation & {
  genesis: boolean;
  content: string;
};

export type DbBrc20DeployInsert = {
  inscription_id: number;
  block_height: number;
  tx_id: string;
  address: string;
  ticker: string;
  max: string;
  decimals: string;
  limit: string | null;
};

export type DbBrc20MintInsert = {
  inscription_id: string;
  brc20_deploy_id: string;
  block_height: string;
  tx_id: string;
  address: string;
  amount: string;
};

export type DbBrc20Deploy = {
  id: string;
  inscription_id: number;
  block_height: number;
  tx_id: string;
  address: string;
  ticker: string;
  max: string;
  decimals: string;
  limit?: string;
};

export type DbBrc20Transfer = {
  id: string;
  inscription_id: number;
  brc20_deploy_id: number;
  block_height: number;
  tx_id: string;
  from_address: string;
  to_address?: string;
  amount: string;
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
};

export type DbBrc20Supply = {
  max_supply: string;
  minted_supply: string;
  holders: string;
};

export type DbBrc20Holder = {
  address: string;
  total_balance: string;
};

export type DbBrc20Balance = {
  ticker: string;
  avail_balance: string;
  trans_balance: string;
  total_balance: string;
};

export enum DbBrc20BalanceTypeId {
  mint = 0,
  transferIntent = 1,
  transferFrom = 2,
  transferTo = 3,
}

export type DbBrc20BalanceInsert = {
  inscription_id: PgNumeric;
  location_id: PgNumeric;
  brc20_deploy_id: PgNumeric;
  address: string | null;
  avail_balance: PgNumeric;
  trans_balance: PgNumeric;
  type: DbBrc20BalanceTypeId;
};

export const BRC20_DEPLOYS_COLUMNS = [
  'id',
  'inscription_id',
  'block_height',
  'tx_id',
  'address',
  'ticker',
  'max',
  'decimals',
  'limit',
];

export const BRC20_TRANSFERS_COLUMNS = [
  'id',
  'inscription_id',
  'brc20_deploy_id',
  'block_height',
  'tx_id',
  'from_address',
  'to_address',
  'amount',
];

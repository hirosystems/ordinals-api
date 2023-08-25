import { PgNumeric } from '@hirosystems/api-toolkit';
import { DbLocation } from '../types';

export type DbBrc20ScannedInscription = DbLocation & {
  genesis: boolean;
  content: string;
};

export type DbBrc20DeployInsert = {
  inscription_id: string;
  block_height: string;
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
  id: number;
  inscription_id: number;
  block_height: number;
  tx_id: string;
  address: string;
  ticker: string;
  max: string;
  decimals: string;
  limit?: string;
};

export type DbBrc20TransferInsert = {
  inscription_id: string;
  brc20_deploy_id: string;
  block_height: string;
  tx_id: string;
  from_address: string;
  to_address: string | null;
  amount: string;
};

export type DbBrc20Transfer = {
  id: string;
  inscription_id: string;
  brc20_deploy_id: string;
  block_height: string;
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
  deploy_timestamp: number;
  minted_supply: string;
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
  address: string;
  avail_balance: PgNumeric;
  trans_balance: PgNumeric;
  type: DbBrc20BalanceTypeId;
};

export type DbBrc20EventOperation = 'deploy' | 'mint' | 'transfer' | 'transfer_send';

export type DbBrc20EventInsert = {
  operation: DbBrc20EventOperation;
  inscription_id: string;
  genesis_location_id: string;
  brc20_deploy_id: string;
  deploy_id: string | null;
  mint_id: string | null;
  transfer_id: string | null;
};

type BaseActivity = {
  ticker: string;
  operation: DbBrc20EventOperation;
  inscription_id: string;
  block_height: string;
  block_hash: string;
  tx_id: string;
  address: string;
  timestamp: number;
};

type DeployActivity = BaseActivity & {
  operation: 'deploy';
  deploy_max: string;
  deploy_limit: string | null;
  deploy_decimals: number;
};

type MintActivity = BaseActivity & {
  operation: 'mint';
  mint_amount: string;
};

type TransferActivity = BaseActivity & {
  operation: 'transfer' | 'transfer_send';
  transfer_data: string;
};

export type DbBrc20Activity = DeployActivity | MintActivity | TransferActivity;

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

import { DbLocationTransferType } from '../types';

export type DbBrc20Location = {
  id: string;
  inscription_id: string | null;
  block_height: string;
  tx_id: string;
  tx_index: number;
  address: string | null;
  transfer_type: DbLocationTransferType;
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
  tx_count: number;
  self_mint: boolean;
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
  inscription_id: string;
  block_height: string;
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

export enum DbBrc20BalanceTypeId {
  mint = 0,
  transferIntent = 1,
  transferFrom = 2,
  transferTo = 3,
}

export enum DbBrc20EventOperation {
  deploy = 'deploy',
  mint = 'mint',
  transfer = 'transfer',
  transferSend = 'transfer_send',
}
export const BRC20_OPERATIONS = ['deploy', 'mint', 'transfer', 'transfer_send'];

type BaseEvent = {
  inscription_id: string;
  genesis_location_id: string;
  brc20_deploy_id: string;
};

export type DbBrc20DeployEvent = BaseEvent & {
  operation: 'deploy';
  deploy_id: string;
  mint_id: null;
  transfer_id: null;
};

export type DbBrc20MintEvent = BaseEvent & {
  operation: 'mint';
  deploy_id: null;
  mint_id: string;
  transfer_id: null;
};

export type DbBrc20TransferEvent = BaseEvent & {
  operation: 'transfer' | 'transfer_send';
  deploy_id: null;
  mint_id: null;
  transfer_id: string;
};

export type DbBrc20Event = DbBrc20DeployEvent | DbBrc20MintEvent | DbBrc20TransferEvent;

type BaseActivity = {
  ticker: string;
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
  timestamp: number;
};

export type DbBrc20DeployActivity = BaseActivity & {
  operation: DbBrc20EventOperation.deploy;
};

export type DbBrc20MintActivity = BaseActivity & {
  operation: DbBrc20EventOperation.mint;
  mint_amount: string;
};

export type DbBrc20TransferActivity = BaseActivity & {
  operation: DbBrc20EventOperation.transfer | DbBrc20EventOperation.transferSend;
  transfer_data: string;
};

export type DbBrc20Activity = DbBrc20DeployActivity | DbBrc20MintActivity | DbBrc20TransferActivity;

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
  'minted_supply',
  'tx_count',
  'self_mint',
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

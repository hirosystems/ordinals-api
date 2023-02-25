import { PgBytea } from './postgres-tools/types';

export type DbPaginatedResult<T> = {
  total: number;
  results: T[];
};

export type DbLocationInsert = {
  inscription_id: number;
  block_height: number;
  block_hash: string;
  tx_id: string;
  address: string;
  output: string;
  offset: number;
  value: number;
  timestamp: number;
  genesis: boolean;
  current: boolean;
};

export type DbLocation = {
  inscription_id: number;
  block_height: number;
  block_hash: string;
  tx_id: string;
  address: string;
  output: string;
  offset: number;
  value: number;
  timestamp: number;
  genesis: boolean;
  current: boolean;
};

export const LOCATIONS_COLUMNS = [
  'inscription_id',
  'block_height',
  'block_hash',
  'tx_id',
  'address',
  'output',
  'offset',
  'value',
  'timestamp',
  'genesis',
  'current',
];

export type DbInscriptionInsert = {
  genesis_id: string;
  mime_type: string;
  content_type: string;
  content_length: number;
  content: PgBytea;
  fee: number;
};

export type DbInscription = {
  genesis_id: string;
  mime_type: string;
  content_type: string;
  content_length: number;
  fee: number;
};

export type DbInscriptionContent = {
  content_type: string;
  content_length: number;
  content: string;
};

export const INSCRIPTIONS_COLUMNS = [
  'genesis_id',
  'mime_type',
  'content_type',
  'content_length',
  'fee',
];

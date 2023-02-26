import { PgBytea } from './postgres-tools/types';

export type DbPaginatedResult<T> = {
  total: number;
  results: T[];
};

export type DbLocatedInscription = {
  inscription: DbInscription;
  location: DbLocation;
};

export type DbFullyLocatedInscription = DbLocatedInscription & {
  genesis: DbLocation;
};

export type DbLocationInsert = {
  inscription_id: number;
  block_height: number;
  block_hash: string;
  tx_id: string;
  address: string;
  output: string;
  offset: bigint;
  value: bigint;
  timestamp: number;
  genesis: boolean;
  current: boolean;
};

export type DbLocation = {
  id: number;
  inscription_id: number;
  block_height: number;
  block_hash: string;
  tx_id: string;
  address: string;
  output: string;
  offset: bigint;
  value: bigint;
  timestamp: number;
  genesis: boolean;
  current: boolean;
};

export const LOCATIONS_COLUMNS = [
  'id',
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
  fee: bigint;
};

export type DbInscription = {
  id: number;
  genesis_id: string;
  number: number;
  mime_type: string;
  content_type: string;
  content_length: number;
  fee: bigint;
};

export type DbInscriptionContent = {
  content_type: string;
  content_length: number;
  content: string;
};

export const INSCRIPTIONS_COLUMNS = [
  'id',
  'genesis_id',
  'number',
  'mime_type',
  'content_type',
  'content_length',
  'fee',
];

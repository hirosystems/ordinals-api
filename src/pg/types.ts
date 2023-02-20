import { PgBytea } from './postgres-tools/types';

export type DbPaginatedResult<T> = {
  total: number;
  results: T[];
};

export type DbInscriptionInsert = {
  inscription_id: string;
  offset: number;
  block_height: number;
  block_hash: PgBytea;
  tx_id: PgBytea;
  address: string;
  sat_ordinal: number;
  sat_point: string;
  fee: number;
  mime_type: string;
  content_type: string;
  content_length: number;
  content: PgBytea;
  timestamp: number;
};

export type DbInscription = {
  inscription_id: string;
  offset: number;
  block_height: number;
  block_hash: string;
  tx_id: string;
  address: string;
  sat_ordinal: bigint;
  sat_point: string;
  fee: number;
  mime_type: string;
  content_type: string;
  content_length: number;
  timestamp: number;
};

export type DbInscriptionContent = {
  content_type: string;
  content_length: number;
  content: string;
};

export const INSCRIPTIONS_COLUMNS = [
  'inscription_id',
  'offset',
  'block_height',
  'block_hash',
  'tx_id',
  'address',
  'sat_ordinal',
  'sat_point',
  'fee',
  'mime_type',
  'content_type',
  'content_length',
  'timestamp',
];

import { Order, OrderBy } from '../api/schemas';
import { SatoshiRarity } from '../api/util/ordinal-satoshi';
import { PgBytea, PgNumeric } from './postgres-tools/types';

export type DbPaginatedResult<T> = {
  total: number;
  results: T[];
};

export type DbFullyLocatedInscriptionResult = {
  genesis_id: string;
  genesis_block_height: string;
  genesis_block_hash: string;
  genesis_tx_id: string;
  genesis_fee: bigint;
  genesis_timestamp: Date;
  genesis_address: string;
  number: string;
  address: string | null;
  tx_id: string;
  tx_index: number;
  output: string;
  offset: string | null;
  value: string | null;
  sat_ordinal: string;
  sat_rarity: string;
  sat_coinbase_height: string;
  mime_type: string;
  content_type: string;
  content_length: string;
  timestamp: Date;
  curse_type: string | null;
};

export type DbLocationInsert = {
  genesis_id: string;
  block_height: number;
  block_hash: string;
  tx_id: string;
  tx_index: number;
  address: string | null;
  output: string;
  offset: PgNumeric | null;
  prev_output: string | null;
  prev_offset: PgNumeric | null;
  value: PgNumeric | null;
  timestamp: number;
};

export type DbLocation = {
  id: string;
  inscription_id: string | null;
  genesis_id: string;
  block_height: string;
  block_hash: string;
  tx_id: string;
  tx_index: number;
  address: string | null;
  output: string;
  offset: string | null;
  prev_output: string | null;
  prev_offset: string | null;
  value: string | null;
  timestamp: Date;
};

export type DbLocationPointerInsert = {
  inscription_id: number;
  location_id: number;
  block_height: number;
  tx_index: number;
};

export type DbInscriptionLocationChange = {
  genesis_id: string;
  number: string;
  from_id: string;
  from_inscription_id: string;
  from_block_height: string;
  from_block_hash: string;
  from_tx_id: string;
  from_address: string | null;
  from_output: string;
  from_offset: string | null;
  from_value: string | null;
  from_timestamp: Date;
  from_genesis: boolean;
  from_current: boolean;
  to_id: string;
  to_inscription_id: string;
  to_block_height: string;
  to_block_hash: string;
  to_tx_id: string;
  to_address: string | null;
  to_output: string;
  to_offset: string | null;
  to_value: string | null;
  to_timestamp: Date;
  to_genesis: boolean;
  to_current: boolean;
};

export const LOCATIONS_COLUMNS = [
  'id',
  'inscription_id',
  'genesis_id',
  'block_height',
  'block_hash',
  'tx_id',
  'tx_index',
  'address',
  'output',
  'offset',
  'value',
  'timestamp',
];

export type DbInscriptionInsert = {
  genesis_id: string;
  number: number;
  mime_type: string;
  content_type: string;
  content_length: number;
  content: PgBytea;
  fee: PgNumeric;
  curse_type: string | null;
  sat_ordinal: PgNumeric;
  sat_rarity: string;
  sat_coinbase_height: number;
};

export type DbInscription = {
  id: string;
  genesis_id: string;
  number: string;
  mime_type: string;
  content_type: string;
  content_length: string;
  fee: string;
  sat_ordinal: string;
  sat_rarity: string;
  sat_coinbase_height: string;
};

export type DbInscriptionContent = {
  content_type: string;
  content_length: string;
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
  'curse_type',
  'sat_ordinal',
  'sat_rarity',
  'sat_coinbase_height',
];

export type DbInscriptionIndexPaging = {
  limit: number;
  offset: number;
};

export type DbInscriptionIndexFilters = {
  genesis_id?: string[];
  genesis_block_height?: number;
  genesis_block_hash?: string;
  from_genesis_block_height?: number;
  to_genesis_block_height?: number;
  from_genesis_timestamp?: number;
  to_genesis_timestamp?: number;
  from_sat_coinbase_height?: number;
  to_sat_coinbase_height?: number;
  number?: number[];
  from_number?: number;
  to_number?: number;
  address?: string[];
  mime_type?: string[];
  output?: string;
  sat_rarity?: SatoshiRarity[];
  sat_ordinal?: bigint;
  from_sat_ordinal?: bigint;
  to_sat_ordinal?: bigint;
};

export type DbInscriptionIndexOrder = {
  order_by?: OrderBy;
  order?: Order;
};

/** Type of row count required for an inscription index endpoint call */
export enum DbInscriptionIndexResultCountType {
  /** All inscriptions */
  all,
  /** Filtered by mime type */
  mimeType,
  /** Filtered by sat rarity */
  satRarity,
  /** Filtered by some param that yields a single result (easy to count) */
  singleResult,
  /** Filtered by custom arguments (very hard to count) */
  intractable,
}

export type DbInscriptionCountPerBlockFilters = {
  from_block_height?: number;
  to_block_height?: number;
};

export type DbInscriptionCountPerBlock = {
  block_height: string;
  block_hash: string;
  inscription_count: string;
  inscription_count_accum: string;
  timestamp: number;
};

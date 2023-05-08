import { DbFullyLocatedInscriptionResult, DbLocation } from '../../pg/types';
import { InscriptionLocationResponse, InscriptionResponseType } from '../schemas';

export const DEFAULT_API_LIMIT = 20;

export function parseDbInscriptions(
  items: DbFullyLocatedInscriptionResult[]
): InscriptionResponseType[] {
  return items.map(i => ({
    id: i.genesis_id,
    number: parseInt(i.number),
    address: i.address,
    genesis_address: i.genesis_address,
    genesis_block_height: parseInt(i.genesis_block_height),
    genesis_block_hash: i.genesis_block_hash,
    genesis_tx_id: i.genesis_tx_id,
    genesis_fee: i.genesis_fee.toString(),
    genesis_timestamp: i.genesis_timestamp.valueOf(),
    tx_id: i.tx_id,
    location: `${i.output}:${i.offset}`,
    output: i.output,
    value: i.value,
    offset: i.offset,
    sat_ordinal: i.sat_ordinal.toString(),
    sat_rarity: i.sat_rarity,
    sat_coinbase_height: parseInt(i.sat_coinbase_height),
    mime_type: i.mime_type,
    content_type: i.content_type,
    content_length: parseInt(i.content_length),
    timestamp: i.timestamp.valueOf(),
  }));
}
export function parseDbInscription(item: DbFullyLocatedInscriptionResult): InscriptionResponseType {
  return parseDbInscriptions([item])[0];
}

export function parseInscriptionLocations(items: DbLocation[]): InscriptionLocationResponse[] {
  return items.map(i => ({
    block_height: parseInt(i.block_height),
    block_hash: i.block_hash,
    address: i.address,
    tx_id: i.tx_id,
    location: `${i.output}:${i.offset}`,
    output: i.output,
    value: i.value,
    offset: i.offset,
    timestamp: i.timestamp.valueOf(),
  }));
}

/**
 * Decodes a `0x` prefixed hex string to a buffer.
 * @param hex - A hex string with a `0x` prefix.
 */
export function hexToBuffer(hex: string): Buffer {
  if (hex.length === 0) {
    return Buffer.alloc(0);
  }
  if (!hex.startsWith('0x')) {
    throw new Error(`Hex string is missing the "0x" prefix: "${hex}"`);
  }
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex string is an odd number of digits: ${hex}`);
  }
  return Buffer.from(hex.substring(2), 'hex');
}

export const has0xPrefix = (id: string) => id.substr(0, 2).toLowerCase() === '0x';

export function normalizedHexString(hex: string): string {
  return has0xPrefix(hex) ? hex.substring(2) : hex;
}

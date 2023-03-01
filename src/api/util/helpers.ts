import { DbFullyLocatedInscriptionResult } from '../../pg/types';
import { InscriptionResponseType } from '../types';

export const DEFAULT_API_LIMIT = 20;

export function parseDbInscriptions(
  items: DbFullyLocatedInscriptionResult[]
): InscriptionResponseType[] {
  return items.map(i => ({
    id: i.genesis_id,
    number: i.number,
    address: i.address,
    genesis_block_height: i.genesis_block_height,
    genesis_block_hash: i.genesis_block_hash,
    genesis_tx_id: i.genesis_tx_id,
    genesis_fee: i.genesis_fee.toString(),
    genesis_timestamp: i.genesis_timestamp,
    location: `${i.output}:${i.offset}`,
    output: i.output,
    offset: i.offset.toString(),
    sat_ordinal: i.sat_ordinal.toString(),
    sat_rarity: i.sat_rarity,
    mime_type: i.mime_type,
    content_type: i.content_type,
    content_length: i.content_length,
    timestamp: i.timestamp,
  }));
}
export function parseDbInscription(item: DbFullyLocatedInscriptionResult): InscriptionResponseType {
  return parseDbInscriptions([item])[0];
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

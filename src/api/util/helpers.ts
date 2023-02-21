import { DbInscription } from '../../pg/types';
import { InscriptionResponseType } from '../types';

export const DEFAULT_API_LIMIT = 20;

export function parseDbInscriptions(items: DbInscription[]): InscriptionResponseType[] {
  return items.map(inscription => ({
    id: inscription.inscription_id,
    address: inscription.address,
    block_height: inscription.block_height,
    block_hash: inscription.block_hash,
    tx_id: inscription.tx_id,
    sat_ordinal: inscription.sat_ordinal.toString(),
    sat_point: inscription.sat_point,
    sat_rarity: inscription.sat_rarity,
    offset: inscription.offset,
    fee: inscription.fee,
    mime_type: inscription.mime_type,
    content_type: inscription.content_type,
    content_length: inscription.content_length,
    timestamp: inscription.timestamp,
  }));
}
export function parseDbInscription(item: DbInscription): InscriptionResponseType {
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

/**
 * Check if the input is a valid 32-byte hex string. If valid, returns a
 * lowercase and 0x-prefixed hex string. If invalid, returns false.
 */
export function normalizeHashString(input: string): string | false {
  if (typeof input !== 'string') {
    return false;
  }
  let hashBuffer: Buffer | undefined;
  if (input.length === 66 && has0xPrefix(input)) {
    hashBuffer = Buffer.from(input.slice(2), 'hex');
  } else if (input.length === 64) {
    hashBuffer = Buffer.from(input, 'hex');
  }
  if (hashBuffer === undefined || hashBuffer.length !== 32) {
    return false;
  }
  return `0x${hashBuffer.toString('hex')}`;
}

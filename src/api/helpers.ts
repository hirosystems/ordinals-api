import { DbInscription } from '../pg/types';
import { InscriptionType } from './types';

export const DEFAULT_API_LIMIT = 20;

export function parseDbInscriptions(items: DbInscription[]): InscriptionType[] {
  return items.map(inscription => ({
    id: inscription.inscription_id,
    address: inscription.address,
    block_height: inscription.block_height,
    block_hash: inscription.block_hash,
    tx_id: inscription.tx_id,
    sat_ordinal: inscription.sat_ordinal.toString(),
    sat_point: inscription.sat_point,
    offset: inscription.offset,
    fee: inscription.fee,
    content_type: inscription.content_type,
    content_length: inscription.content_length,
    timestamp: inscription.timestamp,
  }));
}
export function parseDbInscription(item: DbInscription): InscriptionType {
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

import { PgBytea, logger, toEnumValue } from '@hirosystems/api-toolkit';
import { hexToBuffer, parseSatPoint } from '../api/util/helpers';
import {
  BitcoinInscriptionRevealed,
  BitcoinInscriptionTransferred,
} from '@hirosystems/chainhook-client';
import {
  DbLocationTransferType,
  DbSatoshiInsert,
  DbInscriptionInsert,
  DbLocationInsert,
  DbCurrentLocationInsert,
} from './types';
import { OrdinalSatoshi } from '../api/util/ordinal-satoshi';

/**
 * Returns a list of referenced inscription ids from inscription content.
 * @param content - Inscription content
 * @returns List of IDs
 */
export function getInscriptionRecursion(content: PgBytea): string[] {
  const buf = typeof content === 'string' ? hexToBuffer(content) : content;
  const strContent = buf.toString('utf-8');
  const result: string[] = [];
  for (const match of strContent.matchAll(/\/content\/([a-fA-F0-9]{64}i\d+)/g)) {
    result.push(match[1]);
  }
  return result;
}

/**
 * Returns the values from settled Promise results.
 * Throws if any Promise is rejected.
 * This can be used with Promise.allSettled to get the values from all promises,
 * instead of Promise.all which will swallow following unhandled rejections.
 * @param settles - Array of `Promise.allSettled()` results
 * @returns Array of Promise result values
 */
export function throwOnFirstRejected<T extends any[]>(settles: {
  [K in keyof T]: PromiseSettledResult<T[K]>;
}): T {
  const values: T = [] as any;
  for (const promise of settles) {
    if (promise.status === 'rejected') throw promise.reason;

    // Note: Pushing to result `values` array is required for type inference
    // Compared to e.g. `settles.map(s => s.value)`
    values.push(promise.value);
  }
  return values;
}

export function objRemoveUndefinedValues(obj: object) {
  Object.keys(obj).forEach(key => (obj as any)[key] === undefined && delete (obj as any)[key]);
}

/**
 * Replace null bytes on a string with an empty string
 * @param input - String
 * @returns Sanitized string
 */
export function removeNullBytes(input: string): string {
  return input.replace(/\x00/g, '');
}

export class BlockCache {
  satoshis: DbSatoshiInsert[] = [];
  inscriptions: DbInscriptionInsert[] = [];
  locations: DbLocationInsert[] = [];
  currentLocations = new Map<string, DbCurrentLocationInsert>();
  recursiveRefs = new Map<string, string[]>();
  blockTransferIndex = 0;

  mimeTypeCounts = new Map<string, number>();
  satRarityCounts = new Map<string, number>();
  inscriptionTypeCounts = new Map<string, number>();
  genesisAddressCounts = new Map<string, number>();
  recursiveCounts = new Map<boolean, number>();
  addressCounts = new Map<string, number>();

  reveal(
    reveal: BitcoinInscriptionRevealed,
    block_height: number,
    block_hash: string,
    tx_id: string,
    timestamp: number
  ) {
    const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
    const ordinal_number = reveal.ordinal_number.toString();
    this.satoshis.push({
      ordinal_number,
      rarity: satoshi.rarity,
      coinbase_height: satoshi.blockHeight,
    });
    const satpoint = parseSatPoint(reveal.satpoint_post_inscription);
    const recursive_refs = getInscriptionRecursion(reveal.content_bytes);
    const content_type = removeNullBytes(reveal.content_type);
    const mime_type = content_type.split(';')[0];
    this.inscriptions.push({
      genesis_id: reveal.inscription_id,
      mime_type,
      content_type,
      content_length: reveal.content_length,
      block_height,
      tx_index: reveal.tx_index,
      address: reveal.inscriber_address,
      number: reveal.inscription_number.jubilee,
      classic_number: reveal.inscription_number.classic,
      content: removeNullBytes(reveal.content_bytes),
      fee: reveal.inscription_fee.toString(),
      curse_type: reveal.curse_type ? JSON.stringify(reveal.curse_type) : null,
      ordinal_number,
      recursive: recursive_refs.length > 0,
      metadata: reveal.metadata ? JSON.stringify(reveal.metadata) : null,
      parent: reveal.parent,
      timestamp,
    });
    this.increaseMimeTypeCount(mime_type);
    this.increaseSatRarityCount(satoshi.rarity);
    this.increaseInscriptionTypeCount(reveal.inscription_number.classic < 0 ? 'cursed' : 'blessed');
    this.increaseGenesisAddressCount(reveal.inscriber_address);
    this.increaseAddressCount(reveal.inscriber_address ?? '');
    this.increaseRecursiveCount(recursive_refs.length > 0);
    this.locations.push({
      block_hash,
      block_height,
      tx_id,
      tx_index: reveal.tx_index,
      block_transfer_index: null,
      ordinal_number,
      address: reveal.inscriber_address,
      output: `${satpoint.tx_id}:${satpoint.vout}`,
      offset: satpoint.offset ?? null,
      prev_output: null,
      prev_offset: null,
      value: reveal.inscription_output_value.toString(),
      timestamp,
      transfer_type: getTransferType(reveal),
    });
    this.currentLocations.set(ordinal_number, {
      ordinal_number,
      block_height,
      tx_index: reveal.tx_index,
      address: reveal.inscriber_address,
    });
    this.recursiveRefs.set(reveal.inscription_id, recursive_refs);
  }

  transfer(
    transfer: BitcoinInscriptionTransferred,
    block_height: number,
    block_hash: string,
    tx_id: string,
    timestamp: number
  ) {
    const satpoint = parseSatPoint(transfer.satpoint_post_transfer);
    const prevSatpoint = parseSatPoint(transfer.satpoint_pre_transfer);
    const ordinal_number = transfer.ordinal_number.toString();
    const address = transfer.destination.value ?? null;
    this.locations.push({
      block_hash,
      block_height,
      tx_id,
      tx_index: transfer.tx_index,
      block_transfer_index: this.blockTransferIndex++,
      ordinal_number,
      address,
      output: `${satpoint.tx_id}:${satpoint.vout}`,
      offset: satpoint.offset ?? null,
      prev_output: `${prevSatpoint.tx_id}:${prevSatpoint.vout}`,
      prev_offset: prevSatpoint.offset ?? null,
      value: transfer.post_transfer_output_value
        ? transfer.post_transfer_output_value.toString()
        : null,
      timestamp,
      transfer_type:
        toEnumValue(DbLocationTransferType, transfer.destination.type) ??
        DbLocationTransferType.transferred,
    });
    this.increaseAddressCount(address ?? '');
    this.currentLocations.set(ordinal_number, {
      ordinal_number,
      block_height,
      tx_index: transfer.tx_index,
      address,
    });
  }

  private increaseMimeTypeCount(mime_type: string) {
    const current = this.mimeTypeCounts.get(mime_type);
    if (current == undefined) {
      this.mimeTypeCounts.set(mime_type, 1);
    } else {
      this.mimeTypeCounts.set(mime_type, current + 1);
    }
  }

  private increaseSatRarityCount(rarity: string) {
    const current = this.satRarityCounts.get(rarity);
    if (current == undefined) {
      this.satRarityCounts.set(rarity, 1);
    } else {
      this.satRarityCounts.set(rarity, current + 1);
    }
  }

  private increaseInscriptionTypeCount(type: string) {
    const current = this.inscriptionTypeCounts.get(type);
    if (current == undefined) {
      this.inscriptionTypeCounts.set(type, 1);
    } else {
      this.inscriptionTypeCounts.set(type, current + 1);
    }
  }

  private increaseGenesisAddressCount(address: string | null) {
    if (!address) return;
    const current = this.genesisAddressCounts.get(address);
    if (current == undefined) {
      this.genesisAddressCounts.set(address, 1);
    } else {
      this.genesisAddressCounts.set(address, current + 1);
    }
  }

  private increaseRecursiveCount(recursive: boolean) {
    const current = this.recursiveCounts.get(recursive);
    if (current == undefined) {
      this.recursiveCounts.set(recursive, 1);
    } else {
      this.recursiveCounts.set(recursive, current + 1);
    }
  }

  private increaseAddressCount(address: string) {
    const current = this.addressCounts.get(address);
    if (current == undefined) {
      this.addressCounts.set(address, 1);
    } else {
      this.addressCounts.set(address, current + 1);
    }
  }
}

function getTransferType(reveal: BitcoinInscriptionRevealed) {
  let transfer_type = DbLocationTransferType.transferred;
  if (reveal.inscriber_address == null || reveal.inscriber_address == '') {
    if (reveal.inscription_output_value == 0) {
      if (reveal.inscription_pointer !== 0 && reveal.inscription_pointer !== null) {
        logger.warn(
          `Detected inscription reveal with no address and no output value but a valid pointer ${reveal.inscription_id}`
        );
      }
      transfer_type = DbLocationTransferType.spentInFees;
    } else {
      transfer_type = DbLocationTransferType.burnt;
    }
  }
  return transfer_type;
}

import { PgBytea, logger, toEnumValue } from '@hirosystems/api-toolkit';
import { hexToBuffer, normalizedHexString, parseSatPoint } from '../api/util/helpers';
import {
  BitcoinEvent,
  BitcoinInscriptionRevealed,
  BitcoinInscriptionTransferred,
} from '@hirosystems/chainhook-client';
import {
  DbLocationTransferType,
  InscriptionEventData,
  InscriptionTransferData,
  InscriptionRevealData,
  InscriptionInsert,
  LocationInsert,
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
  inscriptions: InscriptionInsert[] = [];
  locations: LocationInsert[] = [];
  recursiveRefs = new Map<string, string[]>();
  blockTransferIndex = 0;

  reveal(
    reveal: BitcoinInscriptionRevealed,
    block_height: number,
    block_hash: string,
    tx_id: string,
    timestamp: number
  ) {
    const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
    const satpoint = parseSatPoint(reveal.satpoint_post_inscription);
    const recursive_refs = getInscriptionRecursion(reveal.content_bytes);
    const content_type = removeNullBytes(reveal.content_type);
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
    this.inscriptions.push({
      genesis_id: reveal.inscription_id,
      mime_type: content_type.split(';')[0],
      content_type,
      content_length: reveal.content_length,
      number: reveal.inscription_number.jubilee,
      classic_number: reveal.inscription_number.classic,
      content: removeNullBytes(reveal.content_bytes),
      fee: reveal.inscription_fee.toString(),
      curse_type: reveal.curse_type ? JSON.stringify(reveal.curse_type) : null,
      sat_ordinal: reveal.ordinal_number.toString(),
      sat_rarity: satoshi.rarity,
      sat_coinbase_height: satoshi.blockHeight,
      recursive: recursive_refs.length > 0,
      metadata: reveal.metadata ? JSON.stringify(reveal.metadata) : null,
      parent: reveal.parent,
    });
    this.locations.push({
      block_hash,
      block_height,
      tx_id,
      tx_index: reveal.tx_index,
      block_transfer_index: null,
      genesis_id: reveal.inscription_id,
      address: reveal.inscriber_address,
      output: `${satpoint.tx_id}:${satpoint.vout}`,
      offset: satpoint.offset ?? null,
      prev_output: null,
      prev_offset: null,
      value: reveal.inscription_output_value.toString(),
      timestamp,
      transfer_type,
    });
    this.recursiveRefs.set(reveal.inscription_id, recursive_refs);
  }

  transfer(
    transfer: BitcoinInscriptionTransferred,
    block_height: number,
    block_hash: string,
    tx_id: string,
    timestamp: number,
    blockTransferIndex: number
  ) {
    const satpoint = parseSatPoint(transfer.satpoint_post_transfer);
    const prevSatpoint = parseSatPoint(transfer.satpoint_pre_transfer);
    this.locations.push({
      block_hash,
      block_height,
      tx_id,
      tx_index: transfer.tx_index,
      block_transfer_index: blockTransferIndex++,
      ordinal_number: transfer.ordinal_number.toString(),
      address: transfer.destination.value ?? null,
      output: `${satpoint.tx_id}:${satpoint.vout}`,
      offset: satpoint.offset ?? null,
      prev_output: `${prevSatpoint.tx_id}:${prevSatpoint.vout}`,
      prev_offset: prevSatpoint.offset ?? null,
      value: args.transfer.post_transfer_output_value
        ? args.transfer.post_transfer_output_value.toString()
        : null,
      timestamp: args.timestamp,
      transfer_type:
        toEnumValue(DbLocationTransferType, args.transfer.destination.type) ??
        DbLocationTransferType.transferred,
    });
  }
}

function updateFromOrdhookInscriptionRevealed(args: {
  block_height: number;
  block_hash: string;
  tx_id: string;
  timestamp: number;
  reveal: BitcoinInscriptionRevealed;
}): InscriptionRevealData {
  const satoshi = new OrdinalSatoshi(args.reveal.ordinal_number);
  const satpoint = parseSatPoint(args.reveal.satpoint_post_inscription);
  const recursive_refs = getInscriptionRecursion(args.reveal.content_bytes);
  const content_type = removeNullBytes(args.reveal.content_type);
  let transfer_type = DbLocationTransferType.transferred;
  if (args.reveal.inscriber_address == null || args.reveal.inscriber_address == '') {
    if (args.reveal.inscription_output_value == 0) {
      if (args.reveal.inscription_pointer !== 0 && args.reveal.inscription_pointer !== null) {
        logger.warn(
          `Detected inscription reveal with no address and no output value but a valid pointer ${args.reveal.inscription_id}`
        );
      }
      transfer_type = DbLocationTransferType.spentInFees;
    } else {
      transfer_type = DbLocationTransferType.burnt;
    }
  }
  return {
    inscription: {
      genesis_id: args.reveal.inscription_id,
      mime_type: content_type.split(';')[0],
      content_type,
      content_length: args.reveal.content_length,
      number: args.reveal.inscription_number.jubilee,
      classic_number: args.reveal.inscription_number.classic,
      content: removeNullBytes(args.reveal.content_bytes),
      fee: args.reveal.inscription_fee.toString(),
      curse_type: args.reveal.curse_type ? JSON.stringify(args.reveal.curse_type) : null,
      sat_ordinal: args.reveal.ordinal_number.toString(),
      sat_rarity: satoshi.rarity,
      sat_coinbase_height: satoshi.blockHeight,
      recursive: recursive_refs.length > 0,
      metadata: args.reveal.metadata ? JSON.stringify(args.reveal.metadata) : null,
      parent: args.reveal.parent,
    },
    location: {
      block_hash: args.block_hash,
      block_height: args.block_height,
      tx_id: args.tx_id,
      tx_index: args.reveal.tx_index,
      block_transfer_index: null,
      genesis_id: args.reveal.inscription_id,
      address: args.reveal.inscriber_address,
      output: `${satpoint.tx_id}:${satpoint.vout}`,
      offset: satpoint.offset ?? null,
      prev_output: null,
      prev_offset: null,
      value: args.reveal.inscription_output_value.toString(),
      timestamp: args.timestamp,
      transfer_type,
    },
    recursive_refs,
  };
}

function updateFromOrdhookInscriptionTransferred(args: {
  block_height: number;
  block_hash: string;
  tx_id: string;
  timestamp: number;
  blockTransferIndex: number;
  transfer: BitcoinInscriptionTransferred;
}): InscriptionTransferData {
  const satpoint = parseSatPoint(args.transfer.satpoint_post_transfer);
  const prevSatpoint = parseSatPoint(args.transfer.satpoint_pre_transfer);
  return {
    location: {
      block_hash: args.block_hash,
      block_height: args.block_height,
      tx_id: args.tx_id,
      tx_index: args.transfer.tx_index,
      block_transfer_index: args.blockTransferIndex,
      ordinal_number: args.transfer.ordinal_number.toString(),
      address: args.transfer.destination.value ?? null,
      output: `${satpoint.tx_id}:${satpoint.vout}`,
      offset: satpoint.offset ?? null,
      prev_output: `${prevSatpoint.tx_id}:${prevSatpoint.vout}`,
      prev_offset: prevSatpoint.offset ?? null,
      value: args.transfer.post_transfer_output_value
        ? args.transfer.post_transfer_output_value.toString()
        : null,
      timestamp: args.timestamp,
      transfer_type:
        toEnumValue(DbLocationTransferType, args.transfer.destination.type) ??
        DbLocationTransferType.transferred,
    },
  };
}

export function revealInsertsFromOrdhookEvent(event: BitcoinEvent): InscriptionEventData[] {
  // Keep the relative ordering of a transfer within a block for faster future reads.
  let blockTransferIndex = 0;
  const block_height = event.block_identifier.index;
  const block_hash = normalizedHexString(event.block_identifier.hash);
  const writes: InscriptionEventData[] = [];
  for (const tx of event.transactions) {
    const tx_id = normalizedHexString(tx.transaction_identifier.hash);
    for (const operation of tx.metadata.ordinal_operations) {
      if (operation.inscription_revealed)
        writes.push(
          updateFromOrdhookInscriptionRevealed({
            block_hash,
            block_height,
            tx_id,
            timestamp: event.timestamp,
            reveal: operation.inscription_revealed,
          })
        );
      if (operation.inscription_transferred)
        writes.push(
          updateFromOrdhookInscriptionTransferred({
            block_hash,
            block_height,
            tx_id,
            timestamp: event.timestamp,
            blockTransferIndex: blockTransferIndex++,
            transfer: operation.inscription_transferred,
          })
        );
    }
  }
  return writes;
}

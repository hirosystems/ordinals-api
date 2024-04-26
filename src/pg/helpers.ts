import { PgBytea, logger } from '@hirosystems/api-toolkit';
import { hexToBuffer } from '../api/util/helpers';
import { BitcoinInscriptionRevealed } from '@hirosystems/chainhook-client';
import { DbLocationTransferType } from './types';

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

export function getTransferType(reveal: BitcoinInscriptionRevealed) {
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

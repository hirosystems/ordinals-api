import { PgBytea } from '@hirosystems/api-toolkit';
import { hexToBuffer } from '../api/util/helpers';
import { BadPayloadRequestError } from '@hirosystems/chainhook-client';

/**
 * Check if writing a block would create an inscription number gap
 * @param currentNumber - Current max blessed number
 * @param newNumbers - New blessed numbers to be inserted
 */
export function assertNoBlockInscriptionGap(args: {
  currentNumber: number;
  newNumbers: number[];
  currentBlockHeight: number;
  newBlockHeight: number;
}) {
  args.newNumbers.sort((a, b) => a - b);
  for (let n = 0; n < args.newNumbers.length; n++) {
    const curr = args.currentNumber + n;
    const next = args.newNumbers[n];
    if (next !== curr + 1)
      throw new BadPayloadRequestError(
        `Block inscription gap detected: Attempting to insert #${next} (${args.newBlockHeight}) but current max is #${curr}. Chain tip is at ${args.currentBlockHeight}.`
      );
  }
}

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

/**
 * Divides array into equal chunks
 * @param arr - Array
 * @param chunkSize - Chunk size
 * @returns Array of arrays
 */
export function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) result.push(arr.slice(i, i + chunkSize));
  return result;
}

export function objRemoveUndefinedValues(obj: object) {
  Object.keys(obj).forEach(key => (obj as any)[key] === undefined && delete (obj as any)[key]);
}

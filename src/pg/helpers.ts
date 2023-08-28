import { PgBytea } from '@hirosystems/api-toolkit';
import { hexToBuffer } from '../api/util/helpers';

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

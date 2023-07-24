import { PgBytea } from '@hirosystems/api-toolkit';
import { DbInscriptionIndexFilters, DbInscriptionIndexResultCountType } from './types';
import { hexToBuffer } from '../api/util/helpers';

/**
 * Returns which inscription count is required based on filters sent to the index endpoint.
 * @param filters - DbInscriptionIndexFilters
 * @returns DbInscriptionIndexResultCountType
 */
export function getIndexResultCountType(
  filters?: DbInscriptionIndexFilters
): DbInscriptionIndexResultCountType {
  if (!filters) return DbInscriptionIndexResultCountType.all;
  // Remove undefined values.
  Object.keys(filters).forEach(
    key =>
      filters[key as keyof DbInscriptionIndexFilters] === undefined &&
      delete filters[key as keyof DbInscriptionIndexFilters]
  );
  // How many filters do we have?
  switch (Object.keys(filters).length) {
    case 0:
      return DbInscriptionIndexResultCountType.all;
    case 1:
      if (filters.mime_type) return DbInscriptionIndexResultCountType.mimeType;
      if (filters.sat_rarity) return DbInscriptionIndexResultCountType.satRarity;
      if (filters.address) return DbInscriptionIndexResultCountType.address;
      if (filters.number || filters.genesis_id || filters.output || filters.sat_ordinal)
        return DbInscriptionIndexResultCountType.singleResult;
      return DbInscriptionIndexResultCountType.intractable;
    default:
      return DbInscriptionIndexResultCountType.intractable;
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

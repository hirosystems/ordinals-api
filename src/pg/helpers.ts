import { DbInscriptionIndexFilters, DbInscriptionIndexResultCountType } from './types';

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

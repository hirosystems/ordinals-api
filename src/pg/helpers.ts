import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { hexToBuffer } from '../api/util/helpers';
import {
  DbInscriptionIndexFilters,
  DbInscriptionIndexResultCountType,
  DbInscriptionInsert,
} from './types';

const OpJson = Type.Object(
  {
    p: Type.String(),
    op: Type.String(),
  },
  { additionalProperties: true }
);
const OpJsonC = TypeCompiler.Compile(OpJson);
export type OpJson = Static<typeof OpJson>;

export function inscriptionContentToJson(inscription: DbInscriptionInsert): OpJson | undefined {
  if (
    inscription.mime_type.startsWith('text/plain') ||
    inscription.mime_type.startsWith('application/json')
  ) {
    try {
      const buf =
        typeof inscription.content === 'string'
          ? hexToBuffer(inscription.content)
          : inscription.content;
      const result = JSON.parse(buf.toString('utf-8'));
      if (OpJsonC.Check(result)) {
        return result;
      }
    } catch (error) {
      // Not a JSON inscription.
    }
  }
}

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
  switch (Object.keys(filters).length) {
    case 0:
      return DbInscriptionIndexResultCountType.all;
    case 1:
      if (filters.mime_type) return DbInscriptionIndexResultCountType.mimeType;
      if (filters.sat_rarity) return DbInscriptionIndexResultCountType.satRarity;
      return DbInscriptionIndexResultCountType.custom;
    default:
      return DbInscriptionIndexResultCountType.custom;
  }
}

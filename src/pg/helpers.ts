import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { hexToBuffer } from '../api/util/helpers';
import {
  DbInscriptionIndexFilters,
  DbInscriptionIndexResultCountType,
  DbInscriptionInsert,
} from './types';

const OpJsonSchema = Type.Object(
  {
    p: Type.String(),
    op: Type.String(),
  },
  { additionalProperties: true }
);
const OpJsonC = TypeCompiler.Compile(OpJsonSchema);
export type OpJson = Static<typeof OpJsonSchema>;

const Brc20TickerSchema = Type.String({ minLength: 1, maxLength: 4 });

const Brc20DeploySchema = Type.Object(
  {
    p: Type.Literal('brc-20'),
    op: Type.Literal('deploy'),
    tick: Brc20TickerSchema,
    max: Type.String({ minLength: 1 }),
    lim: Type.Optional(Type.String({ minLength: 1 })),
    dec: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: true }
);
export type Brc20Deploy = Static<typeof Brc20DeploySchema>;

const Brc20MintSchema = Type.Object(
  {
    p: Type.Literal('brc-20'),
    op: Type.Literal('mint'),
    tick: Brc20TickerSchema,
    amt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: true }
);
export type Brc20Mint = Static<typeof Brc20MintSchema>;

const Brc20TransferSchema = Type.Object(
  {
    p: Type.Literal('brc-20'),
    op: Type.Literal('transfer'),
    tick: Brc20TickerSchema,
    amt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: true }
);
export type Brc20Transfer = Static<typeof Brc20TransferSchema>;

const Brc20Schema = Type.Union([Brc20DeploySchema, Brc20MintSchema, Brc20TransferSchema]);
const Brc20C = TypeCompiler.Compile(Brc20Schema);
export type Brc20 = Static<typeof Brc20Schema>;

export function brc20FromInscription(inscription: DbInscriptionInsert): Brc20 | undefined {
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
      if (Brc20C.Check(result)) return result;
    } catch (error) {
      // Not a BRC-20 inscription.
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

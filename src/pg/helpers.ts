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

const Brc20DeploySchema = Type.Object({
  p: Type.Literal('brc-20'),
  op: Type.Literal('deploy'),
  tick: Type.String(),
  max: Type.String(),
  lim: Type.Optional(Type.String()),
  dec: Type.Optional(Type.String()),
});
const Brc20DeployC = TypeCompiler.Compile(Brc20DeploySchema);
export type Brc20Deploy = Static<typeof Brc20DeploySchema>;

const Brc20MintSchema = Type.Object({
  p: Type.Literal('brc-20'),
  op: Type.Literal('mint'),
  tick: Type.String(),
  amt: Type.String(),
});
const Brc20MintC = TypeCompiler.Compile(Brc20MintSchema);
export type Brc20Mint = Static<typeof Brc20MintSchema>;

const Brc20TransferSchema = Type.Object({
  p: Type.Literal('brc-20'),
  op: Type.Literal('transfer'),
  tick: Type.String(),
  amt: Type.String(),
});
const Brc20TransferC = TypeCompiler.Compile(Brc20TransferSchema);
export type Brc20Transfer = Static<typeof Brc20TransferSchema>;

const Brc20Schema = Type.Union([Brc20DeploySchema, Brc20MintSchema, Brc20TransferSchema]);
// const Brc20C = TypeCompiler.Compile(Brc20Schema);
export type Brc20 = Static<typeof Brc20Schema>;

/**
 * Tries to parse a text inscription into an OpJson schema.
 * @param inscription - Inscription content
 * @returns OpJson
 */
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

export function brc20DeployFromOpJson(json: OpJson): Brc20Deploy | undefined {
  if (Brc20DeployC.Check(json)) {
    return json;
  }
}

export function brc20MintFromOpJson(json: OpJson): Brc20Mint | undefined {
  if (Brc20MintC.Check(json)) {
    return json;
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

import { Static, Type } from '@fastify/type-provider-typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import BigNumber from 'bignumber.js';
import { hexToBuffer } from '../../api/util/helpers';
import { InscriptionData } from '../types';

const Brc20TickerSchema = Type.String({ minLength: 1 });
const Brc20NumberSchema = Type.RegEx(/^((\d+)|(\d*\.?\d+))$/);

const Brc20DeploySchema = Type.Object(
  {
    p: Type.Literal('brc-20'),
    op: Type.Literal('deploy'),
    tick: Brc20TickerSchema,
    max: Brc20NumberSchema,
    lim: Type.Optional(Brc20NumberSchema),
    dec: Type.Optional(Type.RegEx(/^\d+$/)),
  },
  { additionalProperties: true }
);
export type Brc20Deploy = Static<typeof Brc20DeploySchema>;

const Brc20MintSchema = Type.Object(
  {
    p: Type.Literal('brc-20'),
    op: Type.Literal('mint'),
    tick: Brc20TickerSchema,
    amt: Brc20NumberSchema,
  },
  { additionalProperties: true }
);
export type Brc20Mint = Static<typeof Brc20MintSchema>;

const Brc20TransferSchema = Type.Object(
  {
    p: Type.Literal('brc-20'),
    op: Type.Literal('transfer'),
    tick: Brc20TickerSchema,
    amt: Brc20NumberSchema,
  },
  { additionalProperties: true }
);
export type Brc20Transfer = Static<typeof Brc20TransferSchema>;

const Brc20Schema = Type.Union([Brc20DeploySchema, Brc20MintSchema, Brc20TransferSchema]);
const Brc20C = TypeCompiler.Compile(Brc20Schema);
export type Brc20 = Static<typeof Brc20Schema>;

const UINT64_MAX = BigNumber('18446744073709551615'); // 20 digits
// Only compare against `UINT64_MAX` if the number is at least the same number of digits.
const numExceedsMax = (num: string) => num.length >= 20 && UINT64_MAX.isLessThan(num);

// For testing only
export function brc20FromInscription(inscription: InscriptionData): Brc20 | undefined {
  if (inscription.number < 0) return;
  if (inscription.mime_type !== 'text/plain' && inscription.mime_type !== 'application/json')
    return;
  const buf = hexToBuffer(inscription.content as string).toString('utf-8');
  return brc20FromInscriptionContent(buf);
}

export function brc20FromInscriptionContent(content: string): Brc20 | undefined {
  try {
    const json = JSON.parse(content);
    if (Brc20C.Check(json)) {
      // Check ticker byte length
      if (Buffer.from(json.tick).length !== 4) return;
      // Check numeric values.
      if (json.op === 'deploy') {
        if (parseFloat(json.max) == 0 || numExceedsMax(json.max)) return;
        if (json.lim && (parseFloat(json.lim) == 0 || numExceedsMax(json.lim))) return;
        if (json.dec && parseFloat(json.dec) > 18) return;
      } else {
        if (parseFloat(json.amt) == 0 || numExceedsMax(json.amt)) return;
      }
      return json;
    }
  } catch (error) {
    // Not a BRC-20 inscription.
  }
}

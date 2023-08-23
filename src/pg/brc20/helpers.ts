import { Static, Type } from '@fastify/type-provider-typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import BigNumber from 'bignumber.js';
import { hexToBuffer } from '../../api/util/helpers';
import { DbInscriptionInsert } from '../types';

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

export function brc20FromInscription(inscription: DbInscriptionInsert): Brc20 | undefined {
  if (inscription.number < 0) return;
  if (inscription.mime_type !== 'text/plain' && inscription.mime_type !== 'application/json')
    return;
  const buf =
    typeof inscription.content === 'string'
      ? hexToBuffer(inscription.content)
      : inscription.content;
  return brc20FromInscriptionContent(buf);
}

export function brc20FromInscriptionContent(content: Buffer): Brc20 | undefined {
  try {
    const json = JSON.parse(content.toString('utf-8'));
    if (Brc20C.Check(json)) {
      // Check ticker byte length
      if (Buffer.from(json.tick).length > 4) {
        return;
      }
      // Check numeric values.
      const uint64_max = BigNumber('18446744073709551615');
      if (json.op === 'deploy') {
        const max = BigNumber(json.max);
        if (max.isNaN() || max.isZero() || max.isGreaterThan(uint64_max)) {
          return;
        }
        if (json.lim) {
          const lim = BigNumber(json.lim);
          if (lim.isNaN() || lim.isZero() || lim.isGreaterThan(uint64_max)) {
            return;
          }
        }
        if (json.dec) {
          // `dec` can have a value of 0 but must be no more than 18.
          const dec = BigNumber(json.dec);
          if (dec.isNaN() || dec.isGreaterThan(18)) {
            return;
          }
        }
      } else {
        const amt = BigNumber(json.amt);
        if (amt.isNaN() || amt.isZero() || amt.isGreaterThan(uint64_max)) {
          return;
        }
      }
      return json;
    }
  } catch (error) {
    // Not a BRC-20 inscription.
  }
}

import { Static, Type } from '@fastify/type-provider-typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import BigNumber from 'bignumber.js';
import { hexToBuffer } from '../../api/util/helpers';
import { DbLocationTransferType, InscriptionRevealData } from '../types';

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
    self_mint: Type.Optional(Type.Literal('true')),
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

export const UINT64_MAX = BigNumber('18446744073709551615'); // 20 digits
// Only compare against `UINT64_MAX` if the number is at least the same number of digits.
const numExceedsMax = (num: string) => num.length >= 20 && UINT64_MAX.isLessThan(num);

/**
 * Activation block height for
 * https://l1f.discourse.group/t/brc-20-proposal-for-issuance-and-burn-enhancements-brc20-ip-1/621/1
 */
export const BRC20_SELF_MINT_ACTIVATION_BLOCK = 837090;

export function brc20FromInscription(reveal: InscriptionRevealData): Brc20 | undefined {
  if (
    reveal.inscription.classic_number < 0 ||
    reveal.inscription.number < 0 ||
    reveal.location.transfer_type != DbLocationTransferType.transferred ||
    !['text/plain', 'application/json'].includes(reveal.inscription.mime_type)
  )
    return;
  try {
    const json = JSON.parse(hexToBuffer(reveal.inscription.content as string).toString('utf-8'));
    if (Brc20C.Check(json)) {
      // Check ticker byte length
      const tick = Buffer.from(json.tick);
      if (json.op === 'deploy') {
        if (
          tick.length === 5 &&
          (reveal.location.block_height < BRC20_SELF_MINT_ACTIVATION_BLOCK ||
            json.self_mint !== 'true')
        )
          return;
      }
      if (tick.length < 4 || tick.length > 5) return;
      // Check numeric values.
      if (json.op === 'deploy') {
        if ((parseFloat(json.max) == 0 && json.self_mint !== 'true') || numExceedsMax(json.max))
          return;
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

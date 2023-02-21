import { Static, TSchema, Type } from '@sinclair/typebox';
import { SatoshiRarity, SAT_SUPPLY } from './util/ordinal-satoshi';

export const BitcoinAddressParam = Type.RegEx(/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/);

export const InscriptionIdParam = Type.RegEx(/^[a-fA-F0-9]{64}i[0-9]+$/, {
  description: 'Inscription ID',
  examples: ['38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'],
});

export const OrdinalParam = Type.Integer({ minimum: 0, exclusiveMaximum: SAT_SUPPLY });

export const BlockHeightParam = Type.RegEx(/^[0-9]+$/);

export const BlockHashParam = Type.RegEx(/^(0x)?[0]{8}[a-fA-F0-9]{56}$/);

export const MimeTypeParam = Type.RegEx(/^\w+\/[-.\w]+(?:\+[-.\w]+)?$/);

export const SatoshiRarityParam = Type.Enum(SatoshiRarity);

export const OffsetParam = Type.Integer({ minimum: 0 });

export const LimitParam = Type.Integer({ minimum: 1, maximum: 20 });

export const PaginatedResponse = <T extends TSchema>(type: T) =>
  Type.Object({
    limit: Type.Integer(),
    offset: Type.Integer(),
    total: Type.Integer(),
    results: Type.Array(type),
  });

export const InscriptionResponse = Type.Object({
  id: Type.String(),
  address: Type.String(),
  block_height: Type.Integer(),
  block_hash: Type.String(),
  tx_id: Type.String(),
  sat_ordinal: Type.String(),
  sat_point: Type.String(),
  sat_rarity: Type.String(),
  offset: Type.Integer(),
  fee: Type.Integer(),
  mime_type: Type.String(),
  content_type: Type.String(),
  content_length: Type.Integer(),
  timestamp: Type.Integer(),
});
export type InscriptionResponseType = Static<typeof InscriptionResponse>;

export const SatoshiResponse = Type.Object({
  coinbase_height: Type.Integer(),
  cycle: Type.Integer(),
  decimal: Type.String(),
  degree: Type.String(),
  inscription_id: Type.Optional(Type.String()),
  epoch: Type.Number(),
  name: Type.String(),
  offset: Type.Number(),
  percentile: Type.String(),
  period: Type.Integer(),
  rarity: Type.Enum(SatoshiRarity),
  // timestamp: Type.Integer(),
});

export const NotFoundResponse = Type.Object({
  error: Type.Literal('Not found'),
});

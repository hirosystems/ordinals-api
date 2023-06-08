import { SwaggerOptions } from '@fastify/swagger';
import { Static, TSchema, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { SatoshiRarity, SAT_SUPPLY } from './util/ordinal-satoshi';
import { SERVER_VERSION } from '../server-version';

export const OpenApiSchemaOptions: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Ordinals API',
      description:
        'A service that indexes Bitcoin Ordinals data and exposes it via REST API endpoints.',
      version: SERVER_VERSION.tag,
    },
    externalDocs: {
      url: 'https://github.com/hirosystems/ordinals-api',
      description: 'Source Repository',
    },
    servers: [
      {
        url: 'https://api.hiro.so/',
        description: 'mainnet',
      },
    ],
    tags: [
      {
        name: 'Inscriptions',
        description: 'Endpoints to query ordinal inscriptions',
      },
      {
        name: 'Satoshis',
        description: 'Endpoints to query Satoshi ordinal and rarity information',
      },
    ],
  },
};

// ==========================
// Parameters
// ==========================

const Nullable = <T extends TSchema>(type: T) => Type.Union([type, Type.Null()]);

export const AddressParam = Type.String({
  title: 'Address',
  description: 'Bitcoin address',
  examples: ['bc1p8aq8s3z9xl87e74twfk93mljxq6alv4a79yheadx33t9np4g2wkqqt8kc5'],
});

export const AddressesParam = Type.Array(AddressParam, {
  title: 'Addresses',
  description: 'Array of Bitcoin addresses',
  examples: [
    [
      'bc1p8aq8s3z9xl87e74twfk93mljxq6alv4a79yheadx33t9np4g2wkqqt8kc5',
      'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
    ],
  ],
});

export const InscriptionIdParam = Type.RegEx(/^[a-fA-F0-9]{64}i[0-9]+$/, {
  title: 'Inscription ID',
  description: 'Inscription ID',
  examples: ['38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'],
});
export const InscriptionIdParamCType = TypeCompiler.Compile(InscriptionIdParam);

export const InscriptionIdsParam = Type.Array(InscriptionIdParam, {
  title: 'Inscription IDs',
  description: 'Array of inscription IDs',
  examples: [
    [
      '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      'e3af144354367de58c675e987febcb49f17d6c19e645728b833fe95408feab85i0',
    ],
  ],
});

export const InscriptionNumberParam = Type.Integer({
  title: 'Inscription Number',
  description: 'Inscription number',
  examples: ['10500'],
});
export const InscriptionNumberParamCType = TypeCompiler.Compile(InscriptionNumberParam);

export const InscriptionNumbersParam = Type.Array(InscriptionNumberParam, {
  title: 'Inscription Numbers',
  description: 'Array of inscription numbers',
  examples: [['10500', '65']],
});

export const InscriptionIdentifierParam = Type.Union([InscriptionIdParam, InscriptionNumberParam], {
  title: 'Inscription Identifier',
  description: 'Inscription unique identifier (number or ID)',
  examples: ['145000', '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'],
});

export const OrdinalParam = Type.Integer({
  title: 'Ordinal Number',
  description: 'Ordinal number that uniquely identifies a satoshi',
  examples: [257418248345364],
  minimum: 0,
  exclusiveMaximum: SAT_SUPPLY,
});

export const BlockHeightParam = Type.RegEx(/^[0-9]+$/, {
  title: 'Block Height',
  description: 'Bitcoin block height',
  examples: [777678],
});
export const BlockHeightParamCType = TypeCompiler.Compile(BlockHeightParam);

export const BlockHashParam = Type.RegEx(/^[0]{8}[a-fA-F0-9]{56}$/, {
  title: 'Block Hash',
  description: 'Bitcoin block hash',
  examples: ['0000000000000000000452773967cdd62297137cdaf79950c5e8bb0c62075133'],
});
export const BlockHashParamCType = TypeCompiler.Compile(BlockHashParam);

export const BlockParam = Type.Union([BlockHashParam, BlockHeightParam], {
  title: 'Block Identifier',
  description: 'Bitcoin block identifier (height or hash)',
  examples: [777654, '0000000000000000000452773967cdd62297137cdaf79950c5e8bb0c62075133'],
});

export const MimeTypesParam = Type.Array(
  Type.RegEx(/^\w+\/[-.\w]+(?:\+[-.\w]+)?$/, {
    title: 'MIME Type',
    description: 'MIME type for an inscription content',
    examples: ['image/png'],
  }),
  {
    title: 'MIME Types',
    description: 'Array of inscription MIME types',
    examples: [['image/png', 'image/jpeg']],
  }
);

export const SatoshiRaritiesParam = Type.Array(
  Type.Enum(SatoshiRarity, {
    title: 'Rarity',
    description: 'Rarity of a single satoshi according to Ordinal Theory',
    examples: ['uncommon'],
  }),
  {
    title: 'Rarity',
    description: 'Array of satoshi rarity values',
    examples: [['common', 'uncommon']],
  }
);

export const TimestampParam = Type.Integer({
  title: 'Timestamp',
  description: 'Block UNIX epoch timestamp (milliseconds)',
  examples: [1677731361],
});

export const OutputParam = Type.RegEx(/^[a-fA-F0-9]{64}:[0-9]+$/, {
  title: 'Transaction Output',
  description: 'An UTXO for a Bitcoin transaction',
  examples: ['8f46f0d4ef685e650727e6faf7e30f23b851a7709714ec774f7909b3fb5e604c:0'],
});

export const OffsetParam = Type.Integer({
  minimum: 0,
  title: 'Offset',
  description: 'Result offset',
});

export const LimitParam = Type.Integer({
  minimum: 1,
  maximum: 60,
  title: 'Limit',
  description: 'Results per page',
});

export enum OrderBy {
  genesis_block_height = 'genesis_block_height',
  ordinal = 'ordinal',
  rarity = 'rarity',
}
export const OrderByParam = Type.Enum(OrderBy, {
  title: 'Order By',
  description: 'Parameter to order results by',
});

export enum Order {
  asc = 'asc',
  desc = 'desc',
}
export const OrderParam = Type.Enum(Order, {
  title: 'Order',
  description: 'Results order',
});

// ==========================
// Responses
// ==========================

export const PaginatedResponse = <T extends TSchema>(type: T, title: string) =>
  Type.Object(
    {
      limit: Type.Integer({ examples: [20] }),
      offset: Type.Integer({ examples: [0] }),
      total: Type.Integer({ examples: [1] }),
      results: Type.Array(type),
    },
    { title }
  );

export const InscriptionResponse = Type.Object(
  {
    id: Type.String({
      examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218i0'],
    }),
    number: Type.Integer({ examples: [248751] }),
    address: Nullable(
      Type.String({
        examples: ['bc1pvwh2dl6h388x65rqq47qjzdmsqgkatpt4hye6daf7yxvl0z3xjgq247aq8'],
      })
    ),
    genesis_address: Type.String({
      examples: ['bc1pvwh2dl6h388x65rqq47qjzdmsqgkatpt4hye6daf7yxvl0z3xjgq247aq8'],
    }),
    genesis_block_height: Type.Integer({ examples: [778921] }),
    genesis_block_hash: Type.String({
      examples: ['0000000000000000000452773967cdd62297137cdaf79950c5e8bb0c62075133'],
    }),
    genesis_tx_id: Type.String({
      examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218'],
    }),
    genesis_fee: Type.String({ examples: ['3179'] }),
    genesis_timestamp: Type.Integer({ exmaples: [1677733170000] }),
    tx_id: Type.String({
      examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218'],
    }),
    location: Type.String({
      examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218:0:0'],
    }),
    output: Type.String({
      examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218:0'],
    }),
    value: Nullable(Type.String({ examples: ['546'] })),
    offset: Nullable(Type.String({ examples: ['0'] })),
    sat_ordinal: Type.String({ examples: ['1232735286933201'] }),
    sat_rarity: Type.String({ examples: ['common'] }),
    sat_coinbase_height: Type.Integer({ examples: [430521] }),
    mime_type: Type.String({ examples: ['text/plain'] }),
    content_type: Type.String({ examples: ['text/plain;charset=utf-8'] }),
    content_length: Type.Integer({ examples: [59] }),
    timestamp: Type.Integer({ examples: [1677733170000] }),
    curse_type: Nullable(Type.String({ examples: ['p2wsh'] })),
  },
  { title: 'Inscription Response' }
);
export type InscriptionResponseType = Static<typeof InscriptionResponse>;

export const SatoshiResponse = Type.Object(
  {
    coinbase_height: Type.Integer({ examples: [752860] }),
    cycle: Type.Integer({ examples: [0] }),
    decimal: Type.String({ examples: ['752860.20444193'] }),
    degree: Type.String({ examples: ['0°122860′892″20444193‴'] }),
    inscription_id: Type.Optional(
      Type.String({
        examples: ['ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0'],
      })
    ),
    epoch: Type.Number({ examples: [3] }),
    name: Type.String({ examples: ['ahehcbywzae'] }),
    offset: Type.Number({ examples: [20444193] }),
    percentile: Type.String({ examples: ['91.15654869285287%'] }),
    period: Type.Integer({ examples: [373] }),
    rarity: Type.Enum(SatoshiRarity, { examples: ['common'] }),
  },
  { title: 'Satoshi Response' }
);

export const ApiStatusResponse = Type.Object(
  {
    server_version: Type.String({ examples: [''] }),
    status: Type.String(),
    block_height: Type.Optional(Type.Integer()),
    max_inscription_number: Type.Optional(Type.Integer()),
    max_cursed_inscription_number: Type.Optional(Type.Integer()),
  },
  { title: 'Api Status Response' }
);

export const InscriptionLocationResponseSchema = Type.Object(
  {
    block_height: Type.Integer({ examples: [778921] }),
    block_hash: Type.String({
      examples: ['0000000000000000000452773967cdd62297137cdaf79950c5e8bb0c62075133'],
    }),
    address: Nullable(
      Type.String({
        examples: ['bc1pvwh2dl6h388x65rqq47qjzdmsqgkatpt4hye6daf7yxvl0z3xjgq247aq8'],
      })
    ),
    tx_id: Type.String({
      examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218'],
    }),
    location: Type.String({
      examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218:0:0'],
    }),
    output: Type.String({
      examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218:0'],
    }),
    value: Nullable(Type.String({ examples: ['546'] })),
    offset: Nullable(Type.String({ examples: ['0'] })),
    timestamp: Type.Integer({ examples: [1677733170000] }),
  },
  { title: 'Inscription Location Response' }
);
export type InscriptionLocationResponse = Static<typeof InscriptionLocationResponseSchema>;

export const BlockInscriptionTransferSchema = Type.Object({
  id: Type.String({
    examples: ['1463d48e9248159084929294f64bda04487503d30ce7ab58365df1dc6fd58218i0'],
  }),
  number: Type.Integer({ examples: [248751] }),
  from: InscriptionLocationResponseSchema,
  to: InscriptionLocationResponseSchema,
});
export type BlockInscriptionTransfer = Static<typeof BlockInscriptionTransferSchema>;

export const NotFoundResponse = Type.Object(
  {
    error: Type.Literal('Not found'),
  },
  { title: 'Not Found Response' }
);

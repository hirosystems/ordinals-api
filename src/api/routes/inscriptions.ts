import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { Value } from '@sinclair/typebox/value';
import { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  AddressParam,
  BlockHeightParam,
  InscriptionResponse,
  LimitParam,
  NotFoundResponse,
  OffsetParam,
  PaginatedResponse,
  BlockHashParam,
  MimeTypeParam,
  SatoshiRarityParam,
  OutputParam,
  OrderByParam,
  OrderParam,
  OrderBy,
  Order,
  InscriptionIdParam,
} from '../types';
import { handleChainTipCache, handleInscriptionCache } from '../util/cache';
import {
  DEFAULT_API_LIMIT,
  hexToBuffer,
  parseDbInscription,
  parseDbInscriptions,
} from '../util/helpers';

const BlockHashParamCType = TypeCompiler.Compile(BlockHashParam);
const BlockHeightParamCType = TypeCompiler.Compile(BlockHeightParam);

const IndexRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.addHook('preHandler', handleChainTipCache);
  fastify.get(
    '/inscriptions',
    {
      schema: {
        summary: 'Inscriptions',
        description: 'Retrieves a list of inscriptions with options to filter and sort results',
        tags: ['Inscriptions'],
        querystring: Type.Object({
          genesis_block: Type.Optional(Type.Union([BlockHashParam, BlockHeightParam])),
          output: Type.Optional(OutputParam),
          address: Type.Optional(AddressParam),
          mime_type: Type.Optional(Type.Array(MimeTypeParam)),
          rarity: Type.Optional(SatoshiRarityParam),
          // Pagination
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
          // Ordering
          order_by: Type.Optional(OrderByParam),
          order: Type.Optional(OrderParam),
        }),
        response: {
          200: PaginatedResponse(InscriptionResponse),
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? DEFAULT_API_LIMIT;
      const offset = request.query.offset ?? 0;
      const genBlockArg = BlockHashParamCType.Check(request.query.genesis_block)
        ? { genesis_block_hash: request.query.genesis_block }
        : BlockHeightParamCType.Check(request.query.genesis_block)
        ? { genesis_block_height: request.query.genesis_block }
        : {};
      const inscriptions = await fastify.db.getInscriptions({
        ...genBlockArg,
        output: request.query.output,
        address: request.query.address,
        mime_type: request.query.mime_type,
        sat_rarity: request.query.rarity,
        order_by: request.query.order_by ?? OrderBy.genesis_block_height,
        order: request.query.order ?? Order.desc,
        limit,
        offset,
      });
      await reply.send({
        limit,
        offset,
        total: inscriptions.total,
        results: parseDbInscriptions(inscriptions.results),
      });
    }
  );

  done();
};

const ShowRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.addHook('preHandler', handleInscriptionCache);
  fastify.get(
    '/inscriptions/:inscription_id',
    {
      schema: {
        summary: 'Inscription',
        description: 'Retrieves a single inscription',
        tags: ['Inscriptions'],
        params: Type.Object({
          inscription_id: InscriptionIdParam,
        }),
        response: {
          200: InscriptionResponse,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const inscription = await fastify.db.getInscriptions({
        genesis_id: request.params.inscription_id,
        limit: 1,
        offset: 0,
      });
      if (inscription.total > 0) {
        await reply.send(parseDbInscription(inscription.results[0]));
      } else {
        await reply.code(404).send(Value.Create(NotFoundResponse));
      }
    }
  );

  fastify.get(
    '/inscriptions/:inscription_id/content',
    {
      schema: {
        summary: 'Inscription content',
        description: 'Retrieves the contents of a single inscription',
        tags: ['Inscriptions'],
        params: Type.Object({
          inscription_id: InscriptionIdParam,
        }),
        response: {
          200: Type.Uint8Array(),
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const inscription = await fastify.db.getInscriptionContent({
        inscription_id: request.params.inscription_id,
      });
      if (inscription) {
        const bytes = hexToBuffer(inscription.content);
        await reply
          .headers({
            'content-type': inscription.content_type,
            'content-length': inscription.content_length,
          })
          .send(bytes);
      } else {
        await reply.code(404).send(Value.Create(NotFoundResponse));
      }
    }
  );

  done();
};

export const InscriptionsRoutes: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(IndexRoutes);
  await fastify.register(ShowRoutes);
};

import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  DEFAULT_API_LIMIT,
  hexToBuffer,
  parseDbInscription,
  parseDbInscriptions,
} from '../helpers';
import {
  BitcoinAddressParam,
  BlockHeightParam,
  Inscription,
  InscriptionIdParam,
  LimitParam,
  NotFoundResponse,
  OffsetParam,
  PaginatedResponse,
} from '../types';

export const InscriptionsRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get(
    '/inscriptions',
    {
      schema: {
        summary: 'Inscriptions',
        description: 'Retrieves inscriptions',
        tags: ['Inscriptions'],
        querystring: Type.Object({
          block_height: Type.Optional(BlockHeightParam),
          address: Type.Optional(BitcoinAddressParam),
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
        }),
        response: {
          200: PaginatedResponse(Inscription),
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? DEFAULT_API_LIMIT;
      const offset = request.query.offset ?? 0;
      const inscriptions = await fastify.db.getInscriptions({ ...request.query, limit, offset });
      await reply.send({
        limit,
        offset,
        total: inscriptions.total,
        results: parseDbInscriptions(inscriptions.results),
      });
    }
  );

  fastify.get(
    '/inscriptions/:inscription_id',
    {
      schema: {
        summary: 'Inscription',
        description: 'Retrieves inscription',
        tags: ['Inscriptions'],
        params: Type.Object({
          inscription_id: InscriptionIdParam,
        }),
        response: {
          200: Inscription,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const inscription = await fastify.db.getInscription({
        inscription_id: request.params.inscription_id,
      });
      if (inscription) {
        await reply.send(parseDbInscription(inscription));
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
        description: 'Retrieves inscription content',
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

import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { blockParam } from '../util/helpers';
import { Type } from '@sinclair/typebox';
import { BlockHeightParam } from '../schemas';

const IndexRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.get(
    '/stats/inscriptions',
    {
      schema: {
        operationId: 'getInscriptionCount',
        summary: 'Inscription Count',
        description: 'Retrieves count of inscriptions revealed per block',
        tags: ['Inscriptions'],
        querystring: Type.Object({
          from_block_height: Type.Optional(BlockHeightParam),
          to_block_height: Type.Optional(BlockHeightParam),
        }),
      },
    },
    async (request, reply) => {
      const inscriptions = await fastify.db.getInscriptionCountPerBlock({
        ...blockParam(request.query.from_block_height, 'from_block'),
        ...blockParam(request.query.to_block_height, 'to_block'),
      });
      await reply.send({
        results: inscriptions,
      });
    }
  );
  done();
};

export const StatsRoutes: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(IndexRoutes);
};

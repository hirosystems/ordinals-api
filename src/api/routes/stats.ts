import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { Server } from 'http';

const IndexRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.get('/stats/inscriptions', async (request, reply) => {
    const inscriptions = await fastify.db.getInscriptionCountPerBlock();
    await reply.send({
      results: inscriptions,
    });
  });
  done();
};

export const StatsRoutes: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(IndexRoutes);
};

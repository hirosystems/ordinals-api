import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { PINO_CONFIG } from '../logger';
import { PgStore } from '../pg/pg-store';

export const Chainhook: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.post('/chainhook', async (request, reply) => {
    await reply.code(200).send();
  });
  done();
};

export async function buildChainhookServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  await fastify.register(Chainhook);
  return fastify;
}

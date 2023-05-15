import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { FastifyPluginAsync } from 'fastify';
import { Server } from 'http';
import FastifyCors from '@fastify/cors';
import { PINO_CONFIG } from '../logger';
import { InscriptionsRoutes } from './routes/inscriptions';
import { PgStore } from '../pg/pg-store';
import { SatRoutes } from './routes/sats';
import { StatusRoutes } from './routes/status';
import FastifyMetrics from 'fastify-metrics';
import { isProdEnv } from './util/helpers';

export const Api: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(StatusRoutes);
  await fastify.register(InscriptionsRoutes);
  await fastify.register(SatRoutes);
};

export async function buildApiServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  if (isProdEnv) {
    await fastify.register(FastifyMetrics);
  }
  await fastify.register(FastifyCors);
  await fastify.register(Api, { prefix: '/ordinals/v1' });
  await fastify.register(Api, { prefix: '/ordinals' });

  return fastify;
}

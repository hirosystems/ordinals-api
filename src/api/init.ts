import FastifyCors from '@fastify/cors';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { FastifyPluginAsync } from 'fastify';
import FastifyMetrics from 'fastify-metrics';
import { Server } from 'http';

import { PINO_CONFIG } from '../logger';
import { PgStore } from '../pg/pg-store';
import { InscriptionsRoutes } from './routes/inscriptions';
import { SatRoutes } from './routes/sats';
import { StatsRoutes } from './routes/stats';
import { StatusRoutes } from './routes/status';

export const Api: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(StatusRoutes);
  await fastify.register(InscriptionsRoutes);
  await fastify.register(SatRoutes);
  await fastify.register(StatsRoutes);
};

export async function buildApiServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  if (process.env.NODE_ENV === 'production') {
    await fastify.register(FastifyMetrics);
  }
  await fastify.register(FastifyCors);
  await fastify.register(Api, { prefix: '/ordinals/v1' });
  await fastify.register(Api, { prefix: '/ordinals' });

  return fastify;
}

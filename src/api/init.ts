import * as mempoolJs from '@mempool/mempool.js';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { FastifyPluginAsync } from 'fastify';
import { Server } from 'http';
import FastifyCors from '@fastify/cors';
import { BtcRoutes } from './routes/btc';
import { PINO_CONFIG } from '../logger';
import { ENV } from '../env';
import { AddressRoutes } from './routes/address';

export const Api: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(AddressRoutes, { prefix: '/address' });
  await fastify.register(BtcRoutes);
};

export async function buildApiServer() {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  const mempool = mempoolJs({ hostname: ENV.MEMPOOL_JS_HOSTNAME, network: 'mainnet' });
  fastify.decorate('mempoolJs', mempool);
  await fastify.register(FastifyCors);
  await fastify.register(Api);

  return fastify;
}

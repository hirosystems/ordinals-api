import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { randomUUID } from 'crypto';
import Fastify, { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { request } from 'undici';
import { ENV } from '../env';
import { logger, PINO_CONFIG } from '../logger';
import { PgStore } from '../pg/pg-store';

const CHAINHOOK_BASE_PATH = `http://${ENV.CHAINHOOK_NODE_RPC_HOST}:${ENV.CHAINHOOK_NODE_RPC_PORT}`;
const PREDICATE_UUID = randomUUID();

async function registerChainhookPredicates() {
  logger.info(`Chainhook server registering predicates`);
  const predicates = {
    chain: 'bitcoin',
    uuid: PREDICATE_UUID,
    name: 'inscription_revealed',
    version: 1,
    networks: {
      mainnet: {
        if_this: {
          scope: 'ordinals',
          operation: 'inscription_revealed',
        },
        then_that: {
          http_post: {
            url: `http://${ENV.API_EXTERNAL_HOSTNAME}/chainhook/inscription_revealed`,
          },
        },
      },
    },
  };
  await request(`${CHAINHOOK_BASE_PATH}/v1/chainhooks`, {
    method: 'POST',
    body: JSON.stringify(predicates),
    throwOnError: true,
  });
}

async function removeChainhookPredicates() {
  logger.info(`Chainhook server closing predicates`);
  await request(`${CHAINHOOK_BASE_PATH}/v1/chainhooks/bitcoin/${PREDICATE_UUID}`, {
    method: 'DELETE',
    throwOnError: true,
  });
}

const Chainhook: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.post('/chainhook/inscription_revealed', async (request, reply) => {
    await reply.code(200).send();
  });

  fastify.post('/chainhook/inscription_transfered', async (request, reply) => {
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
  fastify.addHook('onReady', registerChainhookPredicates);
  fastify.addHook('onClose', removeChainhookPredicates);
  await fastify.register(Chainhook);

  return fastify;
}

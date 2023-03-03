import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { randomUUID } from 'crypto';
import Fastify, { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { Server } from 'http';
import { request } from 'undici';
import { ENV } from '../env';
import { logger, PINO_CONFIG } from '../logger';
import { PgStore } from '../pg/pg-store';
import { timeout } from '../pg/postgres-tools/helpers';
import { processInscriptionRevealed, processInscriptionTransferred } from './helpers';

export const CHAINHOOK_BASE_PATH = `http://${ENV.CHAINHOOK_NODE_RPC_HOST}:${ENV.CHAINHOOK_NODE_RPC_PORT}`;
export const REVEAL__PREDICATE_UUID = randomUUID();

async function waitForChainhookNode() {
  logger.info(`EventServer connecting to chainhook node...`);
  while (true) {
    try {
      await request(`${CHAINHOOK_BASE_PATH}/ping`, { method: 'GET', throwOnError: true });
      break;
    } catch (error) {
      logger.error(error, 'Chainhook node not available, retrying...');
      await timeout(1000);
    }
  }
}

/**
 * Register required ordinals predicates in the chainhooks node. This is executed before starting
 * the events server.
 */
async function registerChainhookPredicates() {
  logger.info(`EventServer registering predicates...`);
  await request(`${CHAINHOOK_BASE_PATH}/v1/chainhooks`, {
    method: 'POST',
    body: JSON.stringify({
      chain: 'bitcoin',
      uuid: REVEAL__PREDICATE_UUID,
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
              url: `http://${ENV.EXTERNAL_HOSTNAME}/chainhook/inscription_revealed`,
              authorization_header: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}`,
            },
          },
        },
      },
    }),
    throwOnError: true,
  });
  logger.info(
    `EventServer registered "inscription_revealed" predicate (${REVEAL__PREDICATE_UUID})`
  );
}

/**
 * Remove previously registered predicates. This is executed before closing the events server.
 */
async function removeChainhookPredicates() {
  logger.info(`EventServer closing predicates...`);
  await request(`${CHAINHOOK_BASE_PATH}/v1/chainhooks/bitcoin/${REVEAL__PREDICATE_UUID}`, {
    method: 'DELETE',
    throwOnError: true,
  });
  logger.info(`EventServer removed "inscription_revealed" predicate (${REVEAL__PREDICATE_UUID})`);
}

/**
 * Check that incoming chainhook requests are properly authorized.
 * @param request - Fastify request
 * @param reply - Fastify reply
 */
async function isAuthorizedChainhookEvent(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader === `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}`) {
    return;
  }
  await reply.code(403).send();
}

const Chainhook: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.addHook('preHandler', isAuthorizedChainhookEvent);
  fastify.post('/chainhook/inscription_revealed', async (request, reply) => {
    await processInscriptionRevealed(request.body, fastify.db);
    await reply.code(200).send();
  });
  fastify.post('/chainhook/inscription_transfered', async (request, reply) => {
    await processInscriptionTransferred(request.body, fastify.db);
    await reply.code(200).send();
  });
  done();
};

/**
 * Builds the chainhooks event server.
 * @param args - DB
 * @returns Fastify instance
 */
export async function buildChainhookServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_CONFIG,
    pluginTimeout: 0, // Disable.
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  fastify.addHook('onReady', waitForChainhookNode);
  fastify.addHook('onReady', registerChainhookPredicates);
  fastify.addHook('onClose', removeChainhookPredicates);
  await fastify.register(Chainhook);

  return fastify;
}

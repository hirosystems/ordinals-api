import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { randomUUID } from 'crypto';
import Fastify, {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { Server } from 'http';
import { request } from 'undici';
import { ENV } from '../env';
import { logger, PINO_CONFIG } from '../logger';
import { PgStore } from '../pg/pg-store';
import { timeout } from '../pg/postgres-tools/helpers';
import { processInscriptionRevealed, processInscriptionTransferred } from './helpers';

export const CHAINHOOK_BASE_PATH = `http://${ENV.CHAINHOOK_NODE_RPC_HOST}:${ENV.CHAINHOOK_NODE_RPC_PORT}`;
export const REVEAL__PREDICATE_UUID = randomUUID();

/**
 * Ping the chainhooks node indefinitely until it's ready.
 */
async function waitForChainhookNode(this: FastifyInstance) {
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
async function registerChainhookPredicates(this: FastifyInstance) {
  const blockHeight = await this.db.getChainTipBlockHeight();
  logger.info(`EventServer registering predicates starting from block ${blockHeight}...`);

  const register = async (name: string, uuid: string, blockHeight: number) => {
    await request(`${CHAINHOOK_BASE_PATH}/v1/chainhooks`, {
      method: 'POST',
      body: JSON.stringify({
        bitcoin: {
          uuid: uuid,
          name: name,
          network: 'mainnet',
          version: 1,
          start_block: blockHeight,
          predicate: {
            scope: 'protocol',
            ordinal: name,
          },
          action: {
            http_post: {
              url: `http://${ENV.EXTERNAL_HOSTNAME}/chainhook/inscription_revealed`,
              authorization_header: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}`,
            },
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
      throwOnError: true,
    });
    logger.info(`EventServer registered '${name}' predicate (${uuid})`);
  };

  try {
    await register('inscription_revealed', REVEAL__PREDICATE_UUID, blockHeight);
  } catch (error) {
    logger.error(error, `EventServer unable to register predicate`);
  }
}

/**
 * Remove previously registered predicates. This is executed before closing the events server.
 */
async function removeChainhookPredicates(this: FastifyInstance) {
  logger.info(`EventServer closing predicates...`);

  const deregister = async (name: string, uuid: string) => {
    await request(`${CHAINHOOK_BASE_PATH}/v1/chainhooks/bitcoin/${uuid}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      throwOnError: true,
    });
    logger.info(`EventServer removed '${name}' predicate (${uuid})`);
  };

  try {
    await deregister('inscription_revealed', REVEAL__PREDICATE_UUID);
  } catch (error) {
    logger.error(error, `EventServer unable to deregister predicate`);
  }
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

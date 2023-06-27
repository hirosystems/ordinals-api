import { randomUUID } from 'crypto';
import { ENV } from '../env';
import { logger } from '../logger';
import { PgStore } from '../pg/pg-store';
import {
  ChainhookEventObserver,
  ChainhookNodeOptions,
  Payload,
  ServerOptions,
  ServerPredicate,
} from '@hirosystems/chainhook-client';

export const CHAINHOOK_BASE_PATH = `http://${ENV.CHAINHOOK_NODE_RPC_HOST}:${ENV.CHAINHOOK_NODE_RPC_PORT}`;
export const PREDICATE_UUID = randomUUID();

/**
 * Starts the chainhooks event server.
 * @param args - DB
 * @returns ChainhookEventObserver instance
 */
export async function startChainhookServer(args: { db: PgStore }): Promise<ChainhookEventObserver> {
  const blockHeight = await args.db.getChainTipBlockHeight();
  logger.info(`Ordinals predicate starting from block ${blockHeight}...`);
  const predicate: ServerPredicate = {
    uuid: PREDICATE_UUID,
    name: 'inscription_feed',
    version: 1,
    chain: 'bitcoin',
    networks: {
      mainnet: {
        start_block: blockHeight,
        if_this: {
          scope: 'ordinals_protocol',
          operation: 'inscription_feed',
        },
      },
    },
  };

  const eventServer: ServerOptions = {
    hostname: ENV.API_HOST,
    port: ENV.EVENT_PORT,
    auth_token: ENV.CHAINHOOK_NODE_AUTH_TOKEN,
    external_base_url: `http://${ENV.EXTERNAL_HOSTNAME}`,
  };
  const chainhook: ChainhookNodeOptions = {
    base_url: CHAINHOOK_BASE_PATH,
  };
  const server = new ChainhookEventObserver(eventServer, chainhook);
  await server.start([predicate], async (_uuid: string, payload: Payload) => {
    await args.db.updateInscriptions(payload);
  });
  return server;
}

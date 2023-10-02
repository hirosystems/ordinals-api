import { isProdEnv, logger, registerShutdownConfig } from '@hirosystems/api-toolkit';
import { buildApiServer, buildPromServer } from './api/init';
import { startChainhookServer } from './chainhook/server';
import { ENV } from './env';
import { ApiMetrics } from './metrics/metrics';
import { PgStore } from './pg/pg-store';
import { buildAdminRpcServer } from './admin-rpc/init';
import { buildOrdhookIndexer } from './ordhook';
import Queue from 'queue';

function numberRange(start: number, end: number) {
  return Array.from(Array(end - start + 1).keys()).map(x => x + start);
}

async function initBackgroundServices(jobQueue: Queue, db: PgStore) {
  logger.info('Initializing background services...');
  const ordhook = buildOrdhookIndexer(jobQueue, db);
  registerShutdownConfig({
    name: 'Ordhook Indexer',
    forceKillable: false,
    handler: async () => {
      await ordhook.terminate();
    },
  });
  await ordhook.replayBlockRange(767430, 807750);
  // await ordhook.replayBlocks(numberRange(767430, 809386));
}

async function initApiService(db: PgStore) {
  logger.info('Initializing API service...');
  const fastify = await buildApiServer({ db });
  registerShutdownConfig({
    name: 'API Server',
    forceKillable: false,
    handler: async () => {
      await fastify.close();
    },
  });

  await fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT });

  if (isProdEnv) {
    const promServer = await buildPromServer({ metrics: fastify.metrics });
    registerShutdownConfig({
      name: 'Prometheus Server',
      forceKillable: false,
      handler: async () => {
        await promServer.close();
      },
    });

    ApiMetrics.configure(db);
    await promServer.listen({ host: ENV.API_HOST, port: 9153 });
  }
}

async function initApp() {
  logger.info(`Initializing in ${ENV.RUN_MODE} run mode...`);
  const db = await PgStore.connect({ skipMigrations: ENV.RUN_MODE === 'readonly' });

  const jobQueue = new Queue({ 
    concurrency: 1,
    autostart: true,
  });

  if (['default', 'writeonly'].includes(ENV.RUN_MODE)) {
    await initBackgroundServices(jobQueue, db);
  }
  if (['default', 'readonly'].includes(ENV.RUN_MODE)) {
    await initApiService(db);
  }

  registerShutdownConfig({
    name: 'DB',
    forceKillable: false,
    handler: async () => {
      await db.close();
    },
  });
}

registerShutdownConfig();
initApp()
  .then(() => {
    logger.info('App initialized');
  })
  .catch(error => {
    logger.error(error, `App failed to start`);
    process.exit(1);
  });

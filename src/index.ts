import { buildApiServer, buildPromServer } from './api/init';
import { isProdEnv } from './api/util/helpers';
import { buildChainhookServer } from './chainhook/server';
import { ENV } from './env';
import { logger } from './logger';
import { PgStore } from './pg/pg-store';
import { registerShutdownConfig } from './shutdown-handler';

async function initBackgroundServices(db: PgStore) {
  logger.info('Initializing background services...');
  const server = await buildChainhookServer({ db });
  registerShutdownConfig({
    name: 'Chainhook Server',
    forceKillable: false,
    handler: async () => {
      await server.close();
    },
  });

  await server.listen({ host: ENV.API_HOST, port: ENV.EVENT_PORT });
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

    await promServer.listen({ host: ENV.API_HOST, port: 9153 });
  }
}

async function initApp() {
  logger.info(`Initializing in ${ENV.RUN_MODE} run mode...`);
  const db = await PgStore.connect({ skipMigrations: false });

  if (['default', 'writeonly'].includes(ENV.RUN_MODE)) {
    await initBackgroundServices(db);
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

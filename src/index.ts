import { buildApiServer } from './api/init';
import { ENV } from './env';
import { logger } from './logger';
import { PgStore } from './pg/pg-store';

async function initApp() {
  const db = await PgStore.connect({ skipMigrations: false });
  const fastify = await buildApiServer({ db });
  await fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT });
}

initApp()
  .then(() => {
    logger.info('App initialized');
  })
  .catch(error => {
    logger.error(`App failed to start`, error);
    process.exit(1);
  });

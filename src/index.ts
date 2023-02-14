import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { Api } from './api/init';
import { logger } from './logger';

async function initApp() {
  const fastify = Fastify({
    trustProxy: true,
    logger: true,
    maxParamLength: 1048576, // 1MB
  }).withTypeProvider<TypeBoxTypeProvider>();

  await fastify.register(Api);

  fastify.listen({ host: '0.0.0.0', port: 3000 }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      // process.exit(1)
    }
  });
}

initApp()
  .then(() => {
    logger.info('App initialized');
  })
  .catch(error => {
    logger.error(`App failed to start`, error);
    process.exit(1);
  });

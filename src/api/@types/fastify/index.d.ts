import { MempoolReturn } from '@mempool/mempool.js/lib/interfaces/index';
import fastify from 'fastify';

declare module 'fastify' {
  export interface FastifyInstance<
    HttpServer = Server,
    HttpRequest = IncomingMessage,
    HttpResponse = ServerResponse,
    Logger = FastifyLoggerInstance,
    TypeProvider = FastifyTypeProviderDefault
  > {
    mempoolJs: MempoolReturn;
  }
}

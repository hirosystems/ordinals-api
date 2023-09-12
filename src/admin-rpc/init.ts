import Fastify, { FastifyPluginCallback } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PgStore } from '../pg/pg-store';
import { Server } from 'http';
import { Type } from '@sinclair/typebox';
import { PINO_LOGGER_CONFIG, logger } from '@hirosystems/api-toolkit';

export const AdminApi: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.post(
    '/brc-20/scan',
    {
      schema: {
        description: 'Scan for BRC-20 operations within a block range',
        querystring: Type.Object({
          // TIP: The first BRC-20 token was deployed at height `779832`. This should be a good
          // place to start.
          start_block: Type.Integer(),
          end_block: Type.Integer(),
        }),
      },
    },
    async (request, reply) => {
      const startBlock = request.query.start_block;
      const endBlock = request.query.end_block;
      logger.info(
        `AdminRPC scanning for BRC-20 operations from block ${startBlock} to block ${endBlock}`
      );
      // TODO: Provide a way to stop this scan without restarting.
      fastify.db.brc20
        .scanBlocks(startBlock, endBlock)
        .then(() => logger.info(`AdminRPC finished scanning for BRC-20 operations`))
        .catch(error => logger.error(error, `AdminRPC failed to scan for BRC-20`));
      await reply.code(200).send();
    }
  );

  done();
};

export async function buildAdminRpcServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_LOGGER_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  await fastify.register(AdminApi, { prefix: '/ordinals/admin' });

  return fastify;
}

import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  BlockHashResponse,
  BlockHeightParam,
  BlockHeightResponse,
  BlockTimestampResponse,
  NotFoundResponse,
} from '../schemas';

const IndexRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  // todo: add blockheight cache? or re-use the inscriptions per block cache (since that would invalidate on gaps as well)
  // fastify.addHook('preHandler', handleInscriptionTransfersCache);

  fastify.get(
    '/blockheight',
    {
      schema: {
        operationId: 'getBlockHeight',
        summary: 'Recursion',
        description: 'Retrieves the latest block height',
        tags: ['Recursion'],
        response: {
          200: BlockHeightResponse,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const blockHeight = (await fastify.db.getChainTipBlockHeight()) ?? 'blockheight';
      // Currently, the `chain_tip` materialized view should always  return a
      // minimum of 767430 (inscription #0 genesis), but we'll keep the fallback
      // to stay consistent with `ord`.

      await reply.send(blockHeight.toString());
    }
  );

  fastify.get(
    '/blockhash',
    {
      schema: {
        operationId: 'getBlockHash',
        summary: 'Recursion',
        description: 'Retrieves the latest block hash',
        tags: ['Recursion'],
        response: {
          200: BlockHashResponse,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const blockHash = (await fastify.db.getBlockHash()) ?? 'blockhash';
      await reply.send(blockHash);
    }
  );

  fastify.get(
    '/blocktime',
    {
      schema: {
        operationId: 'getBlockTime',
        summary: 'Recursion',
        description: 'Retrieves the latest block time',
        tags: ['Recursion'],
        response: {
          200: BlockTimestampResponse,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const blockTime = (await fastify.db.getBlockTimestamp()) ?? 'blocktime';
      await reply.send(blockTime);
    }
  );

  done();
};

const ShowRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  // todo: add blockheight cache? or re-use the inscriptions per block cache (since that would invalidate on gaps as well)
  // fastify.addHook('preHandler', handleInscriptionCache);

  fastify.get(
    '/blockhash/:block_height',
    {
      schema: {
        operationId: 'getBlockHash',
        summary: 'Recursion',
        description: 'Retrieves the block hash for a given block height',
        tags: ['Recursion'],
        params: Type.Object({
          block_height: BlockHeightParam,
        }),
        response: {
          200: BlockHashResponse,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const blockHash = (await fastify.db.getBlockHash(request.params.block_height)) ?? 'blockhash';
      await reply.send(blockHash);
    }
  );

  done();
};

export const RecursionRoutes: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(IndexRoutes);
  await fastify.register(ShowRoutes);
};

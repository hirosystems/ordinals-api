import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  AddressParam,
  Brc20BalanceResponseSchema,
  Brc20TickersParam,
  Brc20TokenResponseSchema,
  LimitParam,
  NotFoundResponse,
  OffsetParam,
  PaginatedResponse,
} from '../schemas';
import { DEFAULT_API_LIMIT, parseBrc20Balances, parseBrc20Tokens } from '../util/helpers';
import { Value } from '@sinclair/typebox/value';

export const Brc20Routes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get(
    '/brc-20/tokens',
    {
      schema: {
        operationId: 'getBrc20Tokens',
        summary: 'BRC-20 Tokens',
        description: 'Retrieves information for BRC-20 tokens',
        tags: ['BRC-20'],
        querystring: Type.Object({
          ticker: Type.Optional(Brc20TickersParam),
          // Pagination
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
        }),
        response: {
          200: PaginatedResponse(Brc20TokenResponseSchema, 'Paginated BRC-20 Token Response'),
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? DEFAULT_API_LIMIT;
      const offset = request.query.offset ?? 0;
      const response = await fastify.db.getBrc20Tokens({ ticker: request.query.ticker });
      await reply.send({
        limit,
        offset,
        total: response.total,
        results: parseBrc20Tokens(response.results),
      });
    }
  );

  fastify.get(
    '/brc-20/balances',
    {
      schema: {
        operationId: 'getBrc20Balances',
        summary: 'BRC-20 Balances',
        description: 'Retrieves BRC-20 token balances for a Bitcoin address',
        tags: ['BRC-20'],
        querystring: Type.Object({
          address: AddressParam,
          ticker: Type.Optional(Brc20TickersParam),
          // Pagination
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
        }),
        response: {
          200: PaginatedResponse(Brc20BalanceResponseSchema, 'Paginated BRC-20 Balance Response'),
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? DEFAULT_API_LIMIT;
      const offset = request.query.offset ?? 0;
      const balances = await fastify.db.getBrc20Balances({
        limit,
        offset,
        address: request.query.address,
        ticker: request.query.ticker,
      });
      await reply.send({
        limit,
        offset,
        total: balances.total,
        results: parseBrc20Balances(balances.results),
      });
    }
  );

  done();
};

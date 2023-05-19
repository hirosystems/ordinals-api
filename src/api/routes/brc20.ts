import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  AddressParam,
  Brc20BalanceResponseSchema,
  Brc20TickerParam,
  Brc20TickersParam,
  Brc20TokenResponseSchema,
  LimitParam,
  NotFoundResponse,
  OffsetParam,
  PaginatedResponse,
} from '../schemas';
import { DEFAULT_API_LIMIT, parseBrc20Balances, parseBrc20Token } from '../util/helpers';
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
        description: 'Retrieves deployment and supply info for BRC-20 tokens',
        tags: ['BRC-20'],
        querystring: Type.Object({
          ticker: Brc20TickerParam,
        }),
        response: {
          200: Brc20TokenResponseSchema,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const response = await fastify.db.getBrc20Token({ ticker: request.query.ticker });
      if (response) {
        await reply.send(parseBrc20Token(response));
      } else {
        await reply.code(404).send(Value.Create(NotFoundResponse));
      }
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

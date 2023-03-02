import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { NotFoundResponse, OrdinalParam, SatoshiResponse } from '../schemas';
import { OrdinalSatoshi } from '../util/ordinal-satoshi';

export const SatRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.get(
    '/sats/:ordinal',
    {
      schema: {
        summary: 'Satoshi Ordinal',
        description: 'Retrieves ordinal information for a single satoshi',
        tags: ['Satoshis'],
        params: Type.Object({
          ordinal: OrdinalParam,
        }),
        response: {
          200: SatoshiResponse,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const sat = new OrdinalSatoshi(request.params.ordinal);
      const inscriptions = await fastify.db.getInscriptions({
        sat_ordinal: BigInt(request.params.ordinal),
        limit: 1,
        offset: 0,
      });
      await reply.send({
        coinbase_height: sat.blockHeight,
        cycle: sat.cycle,
        epoch: sat.epoch,
        period: sat.period,
        offset: sat.offset,
        decimal: sat.decimal,
        degree: sat.degree,
        name: sat.name,
        rarity: sat.rarity,
        percentile: sat.percentile,
        inscription_id: inscriptions.results[0]?.genesis_id,
      });
    }
  );

  done();
};

import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { NotFoundResponse, OrdinalParam, SatoshiResponse } from '../types';
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
        summary: 'Inscription',
        description: 'Retrieves inscription',
        tags: ['Inscriptions'],
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
      // const inscription = await fastify.db.getInscription({ ordinal: request.params.ordinal });
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
        // inscription_id: inscription?.genesis_id,
      });
    }
  );

  done();
};

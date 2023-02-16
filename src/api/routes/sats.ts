import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { NotFoundResponse, OrdinalParam, SatoshiResponse } from '../types';
import { getOrdinalSatoshi } from '../util/ordinal-sats';

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
      const sat = getOrdinalSatoshi(request.params.ordinal);
      const inscription = await fastify.db.getInscription({ ordinal: request.params.ordinal });
      await reply.send({
        block_height: sat.block_height,
        cycle: sat.cycle,
        decimal: sat.decimal,
        degree: sat.degree,
        inscription_id: inscription?.inscription_id,
      });
    }
  );

  done();
};

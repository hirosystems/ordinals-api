import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { InscriptionIdRegEx, NotFoundResponse } from '../types';

export const InscriptionsRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get(
    '/inscription/:inscription_id',
    {
      schema: {
        summary: 'Inscription',
        description: 'Retrieves inscription',
        tags: ['Inscriptions'],
        params: Type.Object({
          inscription_id: Type.RegEx(InscriptionIdRegEx, {
            description: 'Inscription ID',
            examples: ['38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'],
          }),
        }),
        response: {
          200: Type.Object({
            id: Type.String(),
            address: Type.String(),
            block_height: Type.Integer(),
            block_hash: Type.String(),
            tx_id: Type.String(),
            sat_ordinal: Type.String(),
            sat_point: Type.String(),
            offset: Type.Integer(),
            fee: Type.Integer(),
            content_type: Type.String(),
            content_length: Type.Integer(),
            timestamp: Type.Integer(),
          }),
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const inscription = await fastify.db.getInscription({
        inscription_id: request.params.inscription_id,
      });
      if (inscription) {
        await reply.send({
          id: inscription.inscription_id,
          address: inscription.address,
          block_height: inscription.block_height,
          block_hash: inscription.block_hash,
          tx_id: inscription.tx_id,
          sat_ordinal: inscription.sat_ordinal.toString(),
          sat_point: inscription.sat_point,
          offset: inscription.offset,
          fee: inscription.fee,
          content_type: inscription.content_type,
          content_length: inscription.content_length,
          timestamp: inscription.timestamp,
        });
      } else {
        await reply.code(404).send(Value.Create(NotFoundResponse));
      }
    }
  );

  fastify.get(
    '/inscription/:inscription_id/content',
    {
      schema: {
        summary: 'Inscription content',
        description: 'Retrieves inscription content',
        tags: ['Inscriptions'],
        params: Type.Object({
          inscription_id: Type.RegEx(InscriptionIdRegEx, {
            description: 'Inscription ID',
            examples: ['38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'],
          }),
        }),
        response: {
          200: Type.String({ contentEncoding: 'binary' }),
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const inscription = await fastify.db.getInscriptionContent({
        inscription_id: request.params.inscription_id,
      });
      if (inscription) {
        await reply
          .headers({
            'Content-Type': inscription.content_type,
            'Content-Length': inscription.content_length,
          })
          .send(inscription.content);
      } else {
        await reply.code(404).send(Value.Create(NotFoundResponse));
      }
    }
  );

  done();
};

import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import BigNumber from 'bignumber.js';
import * as StacksApiTypes from '@stacks/stacks-blockchain-api-types';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { request } from 'undici';
import { ENV } from '../../env';
import { getAddressInfo } from '../util';

export const AddressRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get(
    '/:address',
    {
      schema: {
        tags: ['Utils'],
        summary: 'Convert between a Stacks or Bitcoin address',
        description:
          'Provide either a Stacks or Bitcoin address, and receive the Stacks address, Bitcoin address, and network version.',
        params: Type.Object({
          address: Type.String({
            description: 'Specify either a Stacks or Bitcoin address',
            examples: [
              'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
              '1FzTxL9Mxnm2fdmnQEArfhzJHevwbvcH6d',
            ],
          }),
        }),
        querystring: Type.Object({
          network: Type.Optional(
            Type.Union([Type.Literal('mainnet'), Type.Literal('testnet')], {
              description: 'Specify if the address should be converted to mainnet or testnet',
              examples: ['mainnet', 'testnet'],
            })
          ),
        }),
        response: {
          200: Type.Object(
            {
              stacks: Type.String({
                description: 'Stacks address',
                examples: ['SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7'],
              }),
              bitcoin: Type.String({
                description: 'Bitcoin address',
                examples: ['1FzTxL9Mxnm2fdmnQEArfhzJHevwbvcH6d'],
              }),
              network: Type.String({
                description: 'Network',
                examples: ['mainnet'],
              }),
            },
            {
              description: 'The Stacks address, Bitcoin address, and network version',
            }
          ),
        },
      },
    },
    async (request, reply) => {
      const addrInfo = getAddressInfo(request.params.address, request.query.network);
      await reply.type('application/json').send(addrInfo);
    }
  );

  fastify.get(
    '/:address/balances',
    {
      schema: {
        tags: ['Bitcoin info'],
        summary: 'Get the STX and BTC balance for an address',
        params: Type.Object({
          address: Type.String({
            description: 'Specify either a Stacks or Bitcoin address',
            examples: [
              'SPRSDSRT18DS9R8Y2W13JTKF89NFHEGDWQPB78RE',
              '15XCtJkEDxE1nhFawvPY4QEkEyNywxNSfL',
            ],
          }),
        }),
        response: {
          200: Type.Object(
            {
              stacks: Type.Object({
                address: Type.String({
                  description: 'Specify either a Stacks or Bitcoin address',
                  examples: ['SPRSDSRT18DS9R8Y2W13JTKF89NFHEGDWQPB78RE'],
                }),
                balance: Type.String({
                  description: 'Account balance for the Stacks address',
                  examples: ['2.96584980'],
                }),
              }),
              bitcoin: Type.Object({
                address: Type.String({
                  description: 'Bitcoin address',
                  examples: ['15XCtJkEDxE1nhFawvPY4QEkEyNywxNSfL'],
                }),
                balance: Type.String({
                  description: 'Account balance for the Bitcoin address',
                  examples: ['3.701321'],
                }),
              }),
            },
            {
              description: 'The Bitcoin and Stacks account balances for the given address',
            }
          ),
        },
      },
    },
    async (req, reply) => {
      const addrInfo = getAddressInfo(req.params.address, 'mainnet');

      const stxBalanceReq = await request(
        `${ENV.STACKS_API_ENDPOINT}/extended/v1/address/${addrInfo.stacks}/balances`,
        { method: 'GET' }
      );
      const stxBalance: StacksApiTypes.AddressBalanceResponse = await stxBalanceReq.body.json();
      const stxBalanceFormatted = new BigNumber(stxBalance.stx.balance).shiftedBy(-6).toFixed(6);

      const btcAddress = await fastify.mempoolJs.bitcoin.addresses.getAddress({
        address: addrInfo.bitcoin,
      });
      const satoshiBalance =
        btcAddress.chain_stats.funded_txo_sum - btcAddress.chain_stats.spent_txo_sum;
      const btcBalanceFormatted = new BigNumber(satoshiBalance as BigNumber.Value)
        .shiftedBy(-8)
        .toFixed(8);

      await reply.type('application/json').send({
        stacks: {
          address: addrInfo.stacks,
          balance: stxBalanceFormatted,
        },
        bitcoin: {
          address: addrInfo.bitcoin,
          balance: btcBalanceFormatted,
        },
      });
    }
  );

  done();
};

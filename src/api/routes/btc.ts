import { Server } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  decodeLeaderBlockCommit,
  decodeLeaderVrfKeyRegistration,
  decodeStxTransferOp,
  fetchJson,
  getAddressInfo,
} from '../util';
import { request, fetch as undiciFetch } from 'undici';
import * as stacksApiClient from '@stacks/blockchain-api-client';
import * as stackApiTypes from '@stacks/stacks-blockchain-api-types';
import { b58ToC32 } from 'c32check';
import { ENV } from '../../env';

export const BtcRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.get(
    '/miner-participants/:block',
    {
      schema: {
        tags: ['Bitcoin info'],
        summary: 'Get miners that participated for a Stacks block',
        description:
          'Lookup the miners and their Bitcoin txs that participated in mining a given Stacks blocks.',
        params: Type.Object({
          block: Type.Union(
            [
              Type.String({
                description: 'Stacks block hash',
                pattern: '^(0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64})$',
              }),
              Type.Integer({
                description: 'Stacks block height (block number)',
              }),
            ],
            {
              description: 'A Stacks block hash or block height',
              examples: [
                '0x42a148bf018463f6680e8e215037434b845b145d09272305e16d2411283ca39c',
                66687,
              ],
            }
          ),
        }),
      },
    },
    async (request, reply) => {
      const stxApiConfig = new stacksApiClient.Configuration({
        fetchApi: undiciFetch,
      });
      const stxBlockApi = new stacksApiClient.BlocksApi(stxApiConfig);
      let stxBlockData: stackApiTypes.Block;
      let stxBlockHash: string;
      let stxBlockHeight: number;
      if (typeof request.params.block === 'string') {
        stxBlockHash = request.params.block.toLowerCase();
        if (!stxBlockHash.startsWith('0x')) {
          stxBlockHash + '0x' + stxBlockHash;
        }
        stxBlockData = (await stxBlockApi.getBlockByHash({
          hash: stxBlockHash,
        })) as stackApiTypes.Block;
        stxBlockHeight = stxBlockData.height;
      } else {
        stxBlockHeight = request.params.block;
        stxBlockData = (await stxBlockApi.getBlockByHeight({
          height: stxBlockHeight,
        })) as stackApiTypes.Block;
        stxBlockHash = stxBlockData.hash;
      }

      const btcBlockDataUrl = new URL(
        `/rawblock/${stxBlockData.burn_block_height}`,
        ENV.BLOCKCHAIN_INFO_API_ENDPOINT
      );
      const btcBlockData = await fetchJson<{
        hash: string;
        height: number;
        tx: {
          hash: string;
          inputs: {
            prev_out: {
              addr?: string;
            };
          }[];
          out: {
            script: string;
            addr?: string;
          }[];
        }[];
      }>({ url: btcBlockDataUrl });
      if (btcBlockData.result !== 'ok') {
        throw new Error(
          `Status: ${btcBlockData.status}, response: ${JSON.stringify(btcBlockData.response)}`
        );
      }

      const leaderBlockCommits = btcBlockData.response.tx
        .filter(tx => tx.out.length > 0)
        .map(tx => {
          try {
            const result = decodeLeaderBlockCommit(tx.out[0].script);
            if (!result) {
              return null;
            }
            const addr = tx.inputs[0]?.prev_out?.addr ?? null;
            return {
              txid: tx.hash,
              address: addr,
              stxAddress: addr ? b58ToC32(addr) : null,
              ...result,
            };
          } catch (error) {
            return null;
          }
        })
        .filter(r => r !== null);

      const winner = leaderBlockCommits.find(tx => tx?.txid === stxBlockData.miner_txid.slice(2));
      const participants = leaderBlockCommits.map(tx => {
        return {
          btcTx: tx?.txid,
          stxAddress: tx?.stxAddress,
          btcAddress: tx?.address,
        };
      });
      const payload = {
        winner: winner?.stxAddress,
        participants: participants,
      };
      await reply.send(payload);
    }
  );

  fastify.get(
    '/btc-block-stx-ops/:block',
    {
      schema: {
        tags: ['Bitcoin info'],
        summary: 'Get Stacks operations contained in a Bitcoin block',
        description:
          "Decode any Stacks operations contained with a given Bitcoin block's transactions. Shows Stacks miners that have participated in a given Bitcoin block.",
        params: Type.Object({
          block: Type.Union(
            [
              Type.String({
                description: 'Bitcoin block hash',
                pattern: '^(0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64})$',
              }),
              Type.Integer({
                description: 'Bitcoin block height (block number)',
              }),
            ],
            {
              description: 'A Bitcoin block hash or block height',
              examples: [
                '000000000000000000080e839f4b079220929dab9ce9567e8ba24923c413e14d',
                746204,
              ],
            }
          ),
        }),
      },
    },
    async (request, reply) => {
      const btcBlockDataUrl = new URL(
        `/rawblock/${request.params.block}`,
        ENV.BLOCKCHAIN_INFO_API_ENDPOINT
      );
      const btcBlockData = await fetchJson<{
        hash: string;
        height: number;
        tx: {
          hash: string;
          inputs: {
            prev_out: {
              addr?: string;
            };
          }[];
          out: {
            script: string;
            addr?: string;
          }[];
        }[];
      }>({ url: btcBlockDataUrl });
      if (btcBlockData.result !== 'ok') {
        throw new Error(
          `Status: ${btcBlockData.status}, response: ${JSON.stringify(btcBlockData.response)}`
        );
      }

      const leaderBlockCommits = btcBlockData.response.tx
        .filter(tx => tx.out.length > 0)
        .map(tx => {
          try {
            const result = decodeLeaderBlockCommit(tx.out[0].script);
            if (!result) {
              return null;
            }
            const addr = tx.inputs[0]?.prev_out?.addr ?? null;
            return {
              txid: tx.hash,
              address: addr,
              stxAddress: addr ? b58ToC32(addr) : null,
              ...result,
            };
          } catch (error) {
            return null;
          }
        })
        .filter(r => r !== null);

      const leaderVrfKeyRegistrations = btcBlockData.response.tx
        .filter(tx => tx.out.length > 0)
        .map(tx => {
          try {
            const result = decodeLeaderVrfKeyRegistration(tx.out[0].script);
            if (!result) {
              return null;
            }
            return {
              txid: tx.hash,
              address: tx.inputs[0]?.prev_out?.addr ?? null,
              ...result,
            };
          } catch (error) {
            return null;
          }
        })
        .filter(r => r !== null);

      const stxTransfers = btcBlockData.response.tx
        .filter(tx => tx.out.length > 0)
        .map(tx => {
          try {
            const result = decodeStxTransferOp(tx.out[0].script);
            if (!result) {
              return null;
            }
            const fromAddr = tx.inputs[0]?.prev_out?.addr ?? null;
            const fromStxAddr = fromAddr ? b58ToC32(fromAddr) : null;
            const toBtcAddr = tx.out[1]?.addr ?? null;
            const toStxAddr = toBtcAddr ? b58ToC32(toBtcAddr) : null;
            return {
              txid: tx.hash,
              address: fromAddr,
              fromAddr: fromStxAddr,
              toAddr: toStxAddr,
              ...result,
            };
          } catch (error) {
            return null;
          }
        })
        .filter(r => r !== null);

      const payload = {
        bitcoinBlockHash: btcBlockData.response.hash,
        bitcoinBlockHeight: btcBlockData.response.height,
        stxTransfers: stxTransfers,
        leaderVrfKeyRegistrations: leaderVrfKeyRegistrations,
        leaderBlockCommits: leaderBlockCommits,
      };
      await reply.send(payload);
    }
  );

  fastify.get(
    '/btc-info-from-stx-tx/:txid',
    {
      schema: {
        tags: ['Bitcoin info'],
        summary: 'Get Bitcoin information for a Stacks tx',
        description: 'Get Bitcoin information related to a given Stacks transaction',
        params: Type.Object({
          txid: Type.String({
            description: 'A Stacks transaction ID',
            examples: ['0xc4778249d7af16d004d5344be2683fae5c9263e22d5a2cdd6e1abf38bbdb8fa3'],
            pattern: '^(0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64})$',
          }),
        }),
        response: {
          200: Type.Object(
            {
              stacksTx: Type.String({
                description: 'Stacks transction ID',
                examples: ['0xc4778249d7af16d004d5344be2683fae5c9263e22d5a2cdd6e1abf38bbdb8fa3'],
              }),
              stacksTxExplorer: Type.String({
                description: 'Stacks transction explorer',
                examples: [
                  'https://explorer.stacks.co/txid/0xc4778249d7af16d004d5344be2683fae5c9263e22d5a2cdd6e1abf38bbdb8fa3?chain=mainnet',
                ],
              }),
              stacksBlockHash: Type.String({
                description: 'Stacks block hash',
                examples: ['0x529ed0f3ef381bbb25e9ffe46db87aa3d3de185e31129004a4da010495cc0daa'],
              }),
              stacksBlockExplorer: Type.String({
                description: 'Stacks block explorer',
                examples: [
                  'https://explorer.stacks.co/block/0x529ed0f3ef381bbb25e9ffe46db87aa3d3de185e31129004a4da010495cc0daa?chain=mainnet',
                ],
              }),
              bitcoinBlockHash: Type.String({
                description: 'Bitcoin block hash',
                examples: ['00000000000000000003e70c11501aaba9c0b21229ec75b6be9af4649cd2f8d9'],
              }),
              bitcoinBlockExplorer: Type.String({
                description: 'Stacks transction ID',
                examples: [
                  'https://www.blockchain.com/btc/block/00000000000000000003e70c11501aaba9c0b21229ec75b6be9af4649cd2f8d9',
                ],
              }),
              bitcoinTx: Type.String({
                description: 'Bitcoin transction ID',
                examples: ['d62956b9a1d7cc39e9f6210e3753bfaf10e5c6709b17245c1335befa3fe06d4c'],
              }),
              bitcoinTxExplorer: Type.String({
                description: 'Bitcoin transction explorer',
                examples: [
                  'https://www.blockchain.com/btc/tx/d62956b9a1d7cc39e9f6210e3753bfaf10e5c6709b17245c1335befa3fe06d4c',
                ],
              }),
              minerBtcAddress: Type.String({
                description: 'Miner Bitcoin address',
                examples: ['18HTpsp3YuFqndkxxCJA6PXdtaFUQCfwK6'],
              }),
              minerBtcAddressExplorer: Type.String({
                description: 'Miner Bitcoin address explorer',
                examples: [
                  'https://www.blockchain.com/btc/address/18HTpsp3YuFqndkxxCJA6PXdtaFUQCfwK6',
                ],
              }),
              minerStxAddress: Type.String({
                description: 'Miner Stacks address',
                examples: ['SP17YBVDTV7FNWDM5Y8PWXB9MQRT0FTWZXQBFA97A'],
              }),
              minerStxAddressExplorer: Type.String({
                description: 'Miner Stacks address explorer',
                examples: [
                  'https://explorer.stacks.co/address/SP17YBVDTV7FNWDM5Y8PWXB9MQRT0FTWZXQBFA97A?chain=mainnet',
                ],
              }),
            },
            {
              description: 'Bitcoin information related to the given Stacks transaction',
            }
          ),
        },
      },
    },
    async (request, reply) => {
      let { txid } = request.params;
      txid = txid.toLocaleLowerCase();
      if (!txid.startsWith('0x')) {
        txid + '0x' + txid;
      }
      const stxApiConfig = new stacksApiClient.Configuration({
        fetchApi: undiciFetch,
      });
      const stxTxApi = new stacksApiClient.TransactionsApi(stxApiConfig);
      const stxBlockApi = new stacksApiClient.BlocksApi(stxApiConfig);
      const stxTxData = (await stxTxApi.getTransactionById({
        txId: txid,
      })) as stackApiTypes.Transaction;
      const stxBlockHash = stxTxData.block_hash;
      const stxBlockData = (await stxBlockApi.getBlockByHash({
        hash: stxBlockHash,
      })) as stackApiTypes.Block;
      const btcMinerTx = stxBlockData.miner_txid.slice(2);
      const btcBlockHash = stxBlockData.burn_block_hash.slice(2);

      const stacksBlockExplorerLink = new URL(
        `/block/${stxBlockHash}?chain=mainnet`,
        ENV.STACKS_EXPLORER_ENDPOINT
      );
      const stacksTxExplorerLink = new URL(
        `/txid/${txid}?chain=mainnet`,
        ENV.STACKS_EXPLORER_ENDPOINT
      );

      const btcBlockExplorerLink = new URL(
        `/btc/block/${btcBlockHash}`,
        ENV.BLOCKCHAIN_EXPLORER_ENDPOINT
      );
      const btcTxExplorerLink = new URL(`/btc/tx/${btcMinerTx}`, ENV.BLOCKCHAIN_EXPLORER_ENDPOINT);

      // const btcBlockDataUrl = new URL(`/rawblock/${btcBlockHash}`, BLOCKCHAIN_INFO_API_ENDPOINT);
      const btcTxDataUrl = new URL(`/rawtx/${btcMinerTx}`, ENV.BLOCKCHAIN_INFO_API_ENDPOINT);

      const btcTxData = await fetchJson<{
        inputs: { prev_out: { addr: string } }[];
      }>({ url: btcTxDataUrl });
      const btcMinerAddr =
        btcTxData.result === 'ok' ? btcTxData.response.inputs[0]?.prev_out?.addr ?? '' : '';
      const btcMinerAddrExplorerLink = new URL(
        `/btc/address/${btcMinerAddr}`,
        ENV.BLOCKCHAIN_EXPLORER_ENDPOINT
      );

      const stxMinerAddr = btcMinerAddr ? getAddressInfo(btcMinerAddr).stacks : '';
      const stxMinerAddrExplorerLink = stxMinerAddr
        ? new URL(`/address/${stxMinerAddr}?chain=mainnet`, ENV.STACKS_EXPLORER_ENDPOINT)
        : null;

      const payload = {
        stacksTx: txid,
        stacksTxExplorer: stacksTxExplorerLink.toString(),
        stacksBlockHash: stxBlockHash,
        stacksBlockExplorer: stacksBlockExplorerLink.toString(),
        bitcoinBlockHash: btcBlockHash,
        bitcoinBlockExplorer: btcBlockExplorerLink.toString(),
        bitcoinTx: btcMinerTx,
        bitcoinTxExplorer: btcTxExplorerLink.toString(),
        minerBtcAddress: btcMinerAddr,
        minerBtcAddressExplorer: btcMinerAddrExplorerLink.toString(),
        minerStxAddress: stxMinerAddr,
        minerStxAddressExplorer: stxMinerAddrExplorerLink?.toString() ?? '',
      };

      await reply.type('application/json').send(payload);
    }
  );

  fastify.get(
    '/btc-info-from-stx-block/:block',
    {
      schema: {
        tags: ['Bitcoin info'],
        summary: 'Get Bitcoin information for a Stacks block',
        description: 'Get Bitcoin information related to a given Stacks block',
        params: Type.Object({
          block: Type.Union(
            [
              Type.String({
                description: 'A Stacks block hash',
                pattern: '^(0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64})$',
              }),
              Type.Integer({
                description: 'A Stacks block height (block number)',
              }),
            ],
            {
              description: 'A Stacks block hash or block height',
              examples: [
                '0x529ed0f3ef381bbb25e9ffe46db87aa3d3de185e31129004a4da010495cc0daa',
                69296,
              ],
            }
          ),
        }),
        response: {
          200: Type.Object(
            {
              stacksBlockHash: Type.String({
                description: 'Stacks block hash',
                examples: ['0x529ed0f3ef381bbb25e9ffe46db87aa3d3de185e31129004a4da010495cc0daa'],
              }),
              stacksBlockExplorer: Type.String({
                description: 'Stacks block explorer',
                examples: [
                  'https://explorer.stacks.co/block/0x529ed0f3ef381bbb25e9ffe46db87aa3d3de185e31129004a4da010495cc0daa?chain=mainnet',
                ],
              }),
              bitcoinBlockHash: Type.String({
                description: 'Bitcoin block hash',
                examples: ['00000000000000000003e70c11501aaba9c0b21229ec75b6be9af4649cd2f8d9'],
              }),
              bitcoinBlockExplorer: Type.String({
                description: 'Bitcoin block explorer',
                examples: [
                  'https://www.blockchain.com/btc/block/00000000000000000003e70c11501aaba9c0b21229ec75b6be9af4649cd2f8d9',
                ],
              }),
              bitcoinTx: Type.String({
                description: 'Bitcoin transaction',
                examples: ['d62956b9a1d7cc39e9f6210e3753bfaf10e5c6709b17245c1335befa3fe06d4c'],
              }),
              bitcoinTxExplorer: Type.String({
                description: 'Bitcoin transaction explorer',
                examples: [
                  'https://www.blockchain.com/btc/tx/d62956b9a1d7cc39e9f6210e3753bfaf10e5c6709b17245c1335befa3fe06d4c',
                ],
              }),
              minerBtcAddress: Type.String({
                description: 'Miner Bitcoin address',
                examples: ['18HTpsp3YuFqndkxxCJA6PXdtaFUQCfwK6'],
              }),
              minerBtcAddressExplorer: Type.String({
                description: 'Miner Bitcoin address explorer',
                examples: [
                  'https://www.blockchain.com/btc/address/18HTpsp3YuFqndkxxCJA6PXdtaFUQCfwK6',
                ],
              }),
              minerStxAddress: Type.String({
                description: 'Miner Stacks address',
                examples: ['SP17YBVDTV7FNWDM5Y8PWXB9MQRT0FTWZXQBFA97A'],
              }),
              minerStxAddressExplorer: Type.String({
                description: 'Miner Stacks address explorer',
                examples: [
                  'https://explorer.stacks.co/address/SP17YBVDTV7FNWDM5Y8PWXB9MQRT0FTWZXQBFA97A?chain=mainnet',
                ],
              }),
            },
            {
              description: 'Bitcoin information related to a given Stacks block',
            }
          ),
        },
      },
    },
    async (request, reply) => {
      const { block } = request.params;

      const stxApiConfig = new stacksApiClient.Configuration({
        fetchApi: undiciFetch,
      });
      const stxBlockApi = new stacksApiClient.BlocksApi(stxApiConfig);

      let stxBlockData: stackApiTypes.Block;
      let stxBlockHash: string;
      let stxBlockHeight: number;
      if (typeof block === 'string') {
        stxBlockHash = block.toLowerCase();
        if (!stxBlockHash.startsWith('0x')) {
          stxBlockHash + '0x' + stxBlockHash;
        }
        stxBlockData = (await stxBlockApi.getBlockByHash({
          hash: stxBlockHash,
        })) as stackApiTypes.Block;
        stxBlockHeight = stxBlockData.height;
      } else {
        stxBlockHeight = block;
        stxBlockData = (await stxBlockApi.getBlockByHeight({
          height: stxBlockHeight,
        })) as stackApiTypes.Block;
        stxBlockHash = stxBlockData.hash;
      }

      const btcMinerTx = stxBlockData.miner_txid.slice(2);
      const btcBlockHash = stxBlockData.burn_block_hash.slice(2);

      const stacksBlockExplorerLink = new URL(
        `/block/${stxBlockHash}?chain=mainnet`,
        ENV.STACKS_EXPLORER_ENDPOINT
      );

      const btcBlockExplorerLink = new URL(
        `/btc/block/${btcBlockHash}`,
        ENV.BLOCKCHAIN_EXPLORER_ENDPOINT
      );
      const btcTxExplorerLink = new URL(`/btc/tx/${btcMinerTx}`, ENV.BLOCKCHAIN_EXPLORER_ENDPOINT);

      const btcTxDataUrl = new URL(`/rawtx/${btcMinerTx}`, ENV.BLOCKCHAIN_INFO_API_ENDPOINT);

      const btcTxData = await fetchJson<{
        inputs: { prev_out: { addr: string } }[];
      }>({ url: btcTxDataUrl });
      const btcMinerAddr =
        btcTxData.result === 'ok' ? btcTxData.response.inputs[0]?.prev_out?.addr ?? null : '';
      const btcMinerAddrExplorerLink = new URL(
        `/btc/address/${btcMinerAddr}`,
        ENV.BLOCKCHAIN_EXPLORER_ENDPOINT
      );

      const stxMinerAddr = btcMinerAddr ? getAddressInfo(btcMinerAddr).stacks : '';
      const stxMinerAddrExplorerLink = stxMinerAddr
        ? new URL(`/address/${stxMinerAddr}?chain=mainnet`, ENV.STACKS_EXPLORER_ENDPOINT)
        : '';

      const payload = {
        stacksBlockHash: stxBlockHash,
        stacksBlockExplorer: stacksBlockExplorerLink.toString(),
        bitcoinBlockHash: btcBlockHash,
        bitcoinBlockExplorer: btcBlockExplorerLink.toString(),
        bitcoinTx: btcMinerTx,
        bitcoinTxExplorer: btcTxExplorerLink.toString(),
        minerBtcAddress: btcMinerAddr,
        minerBtcAddressExplorer: btcMinerAddrExplorerLink.toString(),
        minerStxAddress: stxMinerAddr,
        minerStxAddressExplorer: stxMinerAddrExplorerLink?.toString() ?? '',
      };

      await reply.type('application/json').send(payload);
    }
  );

  fastify.get(
    '/stx-block',
    {
      schema: {
        tags: ['Bitcoin info'],
        summary: 'Get the Stacks block associated with a Bitcoin block',
        description:
          'Get the Stacks block information associated with a given Bitcoin block hash or Bitcoin block height',
        querystring: Type.Object({
          'btc-block': Type.Union(
            [
              Type.String({
                description: 'A bitcoin block hash',
                pattern: '^([0-9a-fA-F]{64})$',
              }),
              Type.Integer({
                description: 'A bitcoin block height',
              }),
            ],
            {
              examples: [
                '00000000000000000007a5a46a5989b1e787346c3179a7e7d31ad99abdbc57c8',
                746815,
              ],
            }
          ),
        }),
        response: {
          200: Type.Object(
            {
              height: Type.Number({
                description: 'Stacks block height',
                examples: [69320],
              }),
              hash: Type.String({
                description: 'Stacks block hash',
                examples: ['0x2e4a0e32bc4ea2cd747644a65c73d8f07873fd97ff0227d1aec2e9b264d37f6a'],
              }),
              parent_block_hash: Type.String({
                description: 'Stacks parent block hash',
                examples: ['0xf6312ad452b7dbed13f3f6754d851e03d1f93d649a78f83ca977fe878b2df69c'],
              }),
            },
            {
              description: 'Stacks block related to the given Bitcoin block',
            }
          ),
        },
      },
    },
    async (req, reply) => {
      let stxBlock: any;
      if (typeof req.query['btc-block'] === 'string') {
        const stxBlockRes = await request(
          `${ENV.STACKS_API_ENDPOINT}/extended/v1/block/by_burn_block_hash/0x${req.query['btc-block']}`,
          { method: 'GET' }
        );
        stxBlock = await stxBlockRes.body.json();
      } else {
        const stxBlockRes = await request(
          `${ENV.STACKS_API_ENDPOINT}/extended/v1/block/by_burn_block_height/${req.query['btc-block']}`,
          { method: 'GET' }
        );
        stxBlock = await stxBlockRes.body.json();
      }
      await reply.type('application/json').send({
        height: stxBlock.height,
        hash: stxBlock.hash,
        parent_block_hash: stxBlock.parent_block_hash,
      });
    }
  );

  done();
};

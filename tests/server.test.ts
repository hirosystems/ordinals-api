import { MockAgent, setGlobalDispatcher } from 'undici';
import { CHAINHOOK_BASE_PATH, PREDICATE_UUID, startChainhookServer } from '../src/chainhook/server';
import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder } from './helpers';
import { ChainhookEventObserver } from '@hirosystems/chainhook-client';

describe('EventServer', () => {
  let db: PgStore;

  beforeEach(async () => {
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('parser', () => {
    let server: ChainhookEventObserver;
    let agent: MockAgent;

    beforeEach(async () => {
      agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(CHAINHOOK_BASE_PATH);
      interceptor.intercept({ path: '/ping', method: 'GET' }).reply(200);
      interceptor.intercept({ path: '/v1/chainhooks', method: 'POST' }).reply(200).times(2);
      interceptor
        .intercept({
          path: `/v1/chainhooks/bitcoin/${PREDICATE_UUID}`,
          method: 'DELETE',
        })
        .reply(200);
      setGlobalDispatcher(agent);
      server = await startChainhookServer({ db });
    });

    afterEach(async () => {
      await server.close();
      await agent.close();
    });

    test('parses inscription_reveal apply and rollback', async () => {
      const reveal = {
        block_identifier: {
          index: 107,
          hash: '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
        },
        parent_block_identifier: {
          index: 106,
          hash: '0x117374e7078440835a744b6b1b13dd2c48c4eff8c58dde07162241a8f15d1e03',
        },
        timestamp: 1677803510,
        transactions: [
          {
            transaction_identifier: {
              hash: '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8',
            },
            operations: [],
            metadata: {
              ordinal_operations: [
                {
                  inscription_revealed: {
                    content_bytes: '0x303030303030303030303030',
                    content_type: 'text/plain;charset=utf-8',
                    content_length: 12,
                    inscription_number: 100,
                    inscription_fee: 3425,
                    inscription_output_value: 10000,
                    inscription_id:
                      '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0',
                    inscriber_address:
                      'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                    ordinal_number: 125348773618236,
                    ordinal_block_height: 566462,
                    ordinal_offset: 0,
                    satpoint_post_inscription:
                      '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0:0',
                  },
                },
              ],
              proof: '0x12341234',
            },
          },
        ],
        metadata: {},
      };

      // Apply
      const payload1: ChainhookPayload = {
        apply: [reveal],
        rollback: [],
        chainhook: {
          uuid: '1',
          predicate: {
            scope: 'ordinals_protocol',
            operation: 'inscription_feed',
          },
          is_streaming_blocks: true,
        },
      };
      const response = await server['fastify'].inject({
        method: 'POST',
        url: `/chainhook/${PREDICATE_UUID}`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload1,
      });
      expect(response.statusCode).toBe(200);

      const query = await db.getInscriptions(
        {
          limit: 1,
          offset: 0,
        },
        { genesis_id: ['0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0'] }
      );
      const inscr = query.results[0];
      expect(inscr).not.toBeUndefined();
      expect(inscr.address).toBe('bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td');
      expect(inscr.content_length).toBe('12');
      expect(inscr.content_type).toBe('text/plain;charset=utf-8');
      expect(inscr.genesis_address).toBe(
        'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td'
      );
      expect(inscr.genesis_block_hash).toBe(
        '163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88'
      );
      expect(inscr.genesis_block_height).toBe('107');
      expect(inscr.genesis_fee).toBe('3425');
      expect(inscr.genesis_id).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0'
      );
      expect(inscr.genesis_timestamp.toISOString()).toBe('2023-03-03T00:31:50.000Z');
      expect(inscr.genesis_tx_id).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8'
      );
      expect(inscr.mime_type).toBe('text/plain');
      expect(inscr.number).toBe('100');
      expect(inscr.offset).toBe('0');
      expect(inscr.output).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0'
      );
      expect(inscr.sat_coinbase_height).toBe('25069');
      expect(inscr.sat_ordinal).toBe('125348773618236');
      expect(inscr.sat_rarity).toBe('common');
      expect(inscr.timestamp.toISOString()).toBe('2023-03-03T00:31:50.000Z');
      expect(inscr.value).toBe('10000');

      // Rollback
      const payload2: ChainhookPayload = {
        apply: [],
        rollback: [reveal],
        chainhook: {
          uuid: '1',
          predicate: {
            scope: 'ordinals_protocol',
            operation: 'inscription_feed',
          },
          is_streaming_blocks: true,
        },
      };
      const response2 = await server['fastify'].inject({
        method: 'POST',
        url: `/chainhook/${PREDICATE_UUID}`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload2,
      });
      expect(response2.statusCode).toBe(200);
      const c1 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM inscriptions`;
      expect(c1[0].count).toBe(0);
      const c2 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM locations`;
      expect(c2[0].count).toBe(0);
    });

    test('parses inscription_transferred apply and rollback', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
            timestamp: 1676913207,
          })
          .transaction({
            hash: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed({
            content_bytes: '0x48656C6C6F',
            content_type: 'image/png',
            content_length: 5,
            inscription_number: 7,
            inscription_fee: 2805,
            inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
            inscription_output_value: 10000,
            inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            ordinal_number: 5,
            ordinal_block_height: 0,
            ordinal_offset: 0,
            satpoint_post_inscription:
              '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
          })
          .build()
      );
      const transfer = {
        block_identifier: {
          index: 775618,
          hash: '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
        },
        parent_block_identifier: {
          index: 775617,
          hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        },
        timestamp: 1677803510,
        transactions: [
          {
            transaction_identifier: {
              hash: '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8',
            },
            operations: [],
            metadata: {
              ordinal_operations: [
                {
                  inscription_transferred: {
                    inscription_number: 7,
                    inscription_id:
                      '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
                    ordinal_number: 5,
                    updated_address:
                      'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf00000',
                    satpoint_pre_transfer:
                      '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
                    satpoint_post_transfer:
                      '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0:5000',
                    post_transfer_output_value: 10000,
                  },
                },
              ],
              proof: '0x12341234',
            },
          },
        ],
        metadata: {},
      };

      // Apply
      const payload1: ChainhookPayload = {
        apply: [transfer],
        rollback: [],
        chainhook: {
          uuid: '1',
          predicate: {
            scope: 'ordinals_protocol',
            operation: 'inscription_feed',
          },
          is_streaming_blocks: true,
        },
      };
      const response = await server['fastify'].inject({
        method: 'POST',
        url: `/chainhook/${PREDICATE_UUID}`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload1,
      });
      expect(response.statusCode).toBe(200);

      const query = await db.getInscriptions(
        {
          limit: 1,
          offset: 0,
        },
        { genesis_id: ['38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'] }
      );
      const inscr = query.results[0];
      expect(inscr).not.toBeUndefined();
      expect(inscr.address).toBe('bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf00000');
      expect(inscr.content_length).toBe('5');
      expect(inscr.content_type).toBe('image/png');
      expect(inscr.genesis_address).toBe(
        'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td'
      );
      expect(inscr.genesis_block_hash).toBe(
        '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d'
      );
      expect(inscr.genesis_block_height).toBe('775617');
      expect(inscr.genesis_fee).toBe('2805');
      expect(inscr.genesis_id).toBe(
        '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'
      );
      expect(inscr.genesis_timestamp.toISOString()).toBe('2023-02-20T17:13:27.000Z');
      expect(inscr.genesis_tx_id).toBe(
        '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc'
      );
      expect(inscr.mime_type).toBe('image/png');
      expect(inscr.number).toBe('7');
      expect(inscr.offset).toBe('5000');
      expect(inscr.output).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0'
      );
      expect(inscr.sat_coinbase_height).toBe('0');
      expect(inscr.sat_ordinal).toBe('5');
      expect(inscr.sat_rarity).toBe('common');
      expect(inscr.timestamp.toISOString()).toBe('2023-03-03T00:31:50.000Z');
      expect(inscr.value).toBe('10000');

      // Rollback
      const payload2: ChainhookPayload = {
        apply: [],
        rollback: [transfer],
        chainhook: {
          uuid: '1',
          predicate: {
            scope: 'ordinals_protocol',
            operation: 'inscription_feed',
          },
          is_streaming_blocks: true,
        },
      };
      const response2 = await server['fastify'].inject({
        method: 'POST',
        url: `/chainhook/${PREDICATE_UUID}`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload2,
      });
      expect(response2.statusCode).toBe(200);
      const c1 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM inscriptions`;
      expect(c1[0].count).toBe(1);
      const c2 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM locations`;
      expect(c2[0].count).toBe(1);
    });

    test('saves p/op json content', async () => {
      const reveal = {
        block_identifier: {
          index: 107,
          hash: '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
        },
        parent_block_identifier: {
          index: 106,
          hash: '0x117374e7078440835a744b6b1b13dd2c48c4eff8c58dde07162241a8f15d1e03',
        },
        timestamp: 1677803510,
        transactions: [
          {
            transaction_identifier: {
              hash: '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8',
            },
            operations: [],
            metadata: {
              ordinal_operations: [
                {
                  inscription_revealed: {
                    // { "p": "sns", "op": "reg", "name": "treysongz.sats" }
                    content_bytes:
                      '0x7b202270223a2022736e73222c20226f70223a2022726567222c20226e616d65223a202274726579736f6e677a2e7361747322207d',
                    content_type: 'text/plain;charset=utf-8',
                    content_length: 12,
                    inscription_number: 100,
                    inscription_fee: 3425,
                    inscription_id:
                      '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0',
                    inscriber_address:
                      'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                    ordinal_number: 125348773618236,
                    ordinal_block_height: 566462,
                    ordinal_offset: 0,
                    satpoint_post_inscription:
                      '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0:0',
                    inscription_output_value: 10000,
                  },
                },
              ],
              proof: '0x12341234',
            },
          },
        ],
        metadata: {},
      };

      // Apply
      const payload1: ChainhookPayload = {
        apply: [reveal],
        rollback: [],
        chainhook: {
          uuid: '1',
          predicate: {
            scope: 'ordinals_protocol',
            operation: 'inscription_feed',
          },
          is_streaming_blocks: true,
        },
      };
      const response = await server['fastify'].inject({
        method: 'POST',
        url: `/chainhook/${PREDICATE_UUID}`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload1,
      });
      expect(response.statusCode).toBe(200);

      const json = await db.getJsonContent({ number: 100 });
      expect(json).not.toBeUndefined();
      expect(json?.p).toBe('sns');
      expect(json?.op).toBe('reg');
      expect(json?.content).toStrictEqual({
        name: 'treysongz.sats',
        op: 'reg',
        p: 'sns',
      });
    });
  });
});

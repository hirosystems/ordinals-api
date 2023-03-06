import { MockAgent, setGlobalDispatcher } from 'undici';
import {
  buildChainhookServer,
  CHAINHOOK_BASE_PATH,
  REVEAL__PREDICATE_UUID,
} from '../src/chainhook/server';
import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestFastifyServer } from './helpers';

describe('EventServer', () => {
  let db: PgStore;

  beforeEach(async () => {
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('hooks', () => {
    test('waits for chainhooks node to be ready', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(CHAINHOOK_BASE_PATH);
      // Fail ping 2 times
      interceptor.intercept({ path: '/ping', method: 'GET' }).reply(503).times(2);
      // Succeed
      interceptor.intercept({ path: '/ping', method: 'GET' }).reply(200);
      interceptor.intercept({ path: '/v1/chainhooks', method: 'POST' }).reply(200);
      interceptor
        .intercept({
          path: `/v1/chainhooks/bitcoin/${REVEAL__PREDICATE_UUID}`,
          method: 'DELETE',
        })
        .reply(200);
      setGlobalDispatcher(agent);

      const fastify = await buildChainhookServer({ db });
      const payload = { test: 'value' };
      await fastify.inject({
        method: 'POST',
        url: '/chainhook/inscription_revealed',
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload,
      });

      await fastify.close();
      await agent.close();
      agent.assertNoPendingInterceptors();
    });

    test('ignores unauthorized events', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(CHAINHOOK_BASE_PATH);
      interceptor.intercept({ path: '/ping', method: 'GET' }).reply(200);
      interceptor.intercept({ path: '/v1/chainhooks', method: 'POST' }).reply(200);
      interceptor
        .intercept({
          path: `/v1/chainhooks/bitcoin/${REVEAL__PREDICATE_UUID}`,
          method: 'DELETE',
        })
        .reply(200);
      setGlobalDispatcher(agent);

      const fastify = await buildChainhookServer({ db });
      const payload = { test: 'value' };
      const response = await fastify.inject({
        method: 'POST',
        url: '/chainhook/inscription_revealed',
        payload,
      });
      expect(response.statusCode).toBe(403);

      await fastify.close();
      await agent.close();
    });
  });

  describe('parser', () => {
    let fastify: TestFastifyServer;
    let agent: MockAgent;

    beforeEach(async () => {
      agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(CHAINHOOK_BASE_PATH);
      interceptor.intercept({ path: '/ping', method: 'GET' }).reply(200);
      interceptor.intercept({ path: '/v1/chainhooks', method: 'POST' }).reply(200);
      interceptor
        .intercept({
          path: `/v1/chainhooks/bitcoin/${REVEAL__PREDICATE_UUID}`,
          method: 'DELETE',
        })
        .reply(200);
      setGlobalDispatcher(agent);
      fastify = await buildChainhookServer({ db });
    });

    afterEach(async () => {
      await fastify.close();
      await agent.close();
    });

    test('parses inscription_revealed apply and rollback', async () => {
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
              outputs: [
                {
                  value: 10000,
                  script_pubkey:
                    '0x512069cb384754a2ba3fde965ce4e27c60488abe6963181f5f08385dc89615d53520',
                },
              ],
              ordinal_operations: [
                {
                  inscription_revealed: {
                    content_bytes: '0x303030303030303030303030',
                    content_type: 'text/plain;charset=utf-8',
                    content_length: 12,
                    inscription_number: 100,
                    inscription_fee: 3425,
                    inscription_id:
                      '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0',
                    inscription_authors: [
                      'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                    ],
                    ordinal_number: 125348773618236,
                    ordinal_block_height: 566462,
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
      const payload1 = {
        apply: [reveal],
        rollback: [],
        chainhook: {
          uuid: '1',
          predicate: {
            scope: 'protocol',
            ordinal: 'inscription_revealed',
          },
        },
      };
      const response = await fastify.inject({
        method: 'POST',
        url: '/chainhook/inscription_revealed',
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload1,
      });
      expect(response.statusCode).toBe(200);

      const query = await db.getInscriptions({
        genesis_id: ['0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0'],
        limit: 1,
        offset: 0,
      });
      const inscr = query.results[0];
      expect(inscr).not.toBeUndefined();
      expect(inscr.address).toBe('bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td');
      expect(inscr.content_length).toBe(12);
      expect(inscr.content_type).toBe('text/plain;charset=utf-8');
      expect(inscr.genesis_address).toBe(
        'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td'
      );
      expect(inscr.genesis_block_hash).toBe(
        '163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88'
      );
      expect(inscr.genesis_block_height).toBe(107);
      expect(inscr.genesis_fee).toBe('3425');
      expect(inscr.genesis_id).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0'
      );
      expect(inscr.genesis_timestamp.toISOString()).toBe('2023-03-03T00:31:50.000Z');
      expect(inscr.genesis_tx_id).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8'
      );
      expect(inscr.mime_type).toBe('text/plain');
      expect(inscr.number).toBe(100);
      expect(inscr.offset).toBe('0');
      expect(inscr.output).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0'
      );
      expect(inscr.sat_coinbase_height).toBe(25069);
      expect(inscr.sat_ordinal).toBe('125348773618236');
      expect(inscr.sat_rarity).toBe('common');
      expect(inscr.timestamp.toISOString()).toBe('2023-03-03T00:31:50.000Z');
      expect(inscr.value).toBe('10000');

      // Rollback
      const payload2 = {
        apply: [],
        rollback: [reveal],
        chainhook: {
          uuid: '1',
          predicate: {
            scope: 'protocol',
            ordinal: 'inscription_revealed',
          },
        },
      };
      const response2 = await fastify.inject({
        method: 'POST',
        url: '/chainhook/inscription_revealed',
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload2,
      });
      expect(response2.statusCode).toBe(200);
      const c1 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM inscriptions`;
      expect(c1[0].count).toBe(0);
      const c2 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM locations`;
      expect(c2[0].count).toBe(0);
    });
  });
});

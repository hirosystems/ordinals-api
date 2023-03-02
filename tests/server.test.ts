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
    ENV.PGDATABASE = 'postgres';
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
        payload,
      });

      await fastify.close();
      await agent.close();
      agent.assertNoPendingInterceptors();
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

    test('parses inscription_revealed', async () => {
      const payload = {
        apply: [
          {
            block_identifier: {
              hash: '0x00000000000000000004af71ba45e864d949f086ba4824d6812a1b957811015d',
              index: 778750,
            },
            metadata: {},
            parent_block_identifier: {
              hash: '0x00000000000000000002761eed740819dbcb0179850bcb7e8ae5222286f707af',
              index: 778749,
            },
            timestamp: 1677645277,
            transactions: [
              {
                metadata: {
                  ordinal_operations: [
                    {
                      inscription_revealed: {
                        content:
                          '0x7b200a20202270223a2022736e73222c0a2020226f70223a2022726567222c0a2020226e616d65223a2022787469702e73617473220a7d',
                        content_type: 'text/plain;charset=utf-8',
                        satoshi_point: null,
                      },
                    },
                  ],
                  proof: null,
                },
                operations: [],
                transaction_identifier: {
                  hash: '0xe7523bec9e0778fcd4cca52c00a6beb65644be42247f8d21a26d55414d47fc61',
                },
              },
              {
                metadata: {
                  ordinal_operations: [
                    {
                      inscription_revealed: {
                        content:
                          '0x7b200a20202270223a2022736e73222c0a2020226f70223a2022726567222c0a2020226e616d65223a202267617573656c6d616e6e2e73617473220a7d',
                        content_type: 'text/plain;charset=utf-8',
                        satoshi_point: null,
                      },
                    },
                  ],
                  proof: null,
                },
                operations: [],
                transaction_identifier: {
                  hash: '0x568032b2616aa265d50e0d23018691cb38a90fc38ffc226d3487a9ca220b36bb',
                },
              },
            ],
          },
        ],
        chainhook: {
          predicate: {
            ordinal: 'inscription_revealed',
            scope: 'protocol',
          },
          uuid: '1',
        },
        rollback: [],
      };
      const response = await fastify.inject({
        method: 'POST',
        url: '/chainhook/inscription_revealed',
        payload,
      });
      expect(response.statusCode).toBe(200);
    });
  });
});

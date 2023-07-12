import { buildApiServer } from '../src/api/init';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer, randomHash } from './helpers';

jest.setTimeout(100_000_000);

describe('/stats', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await buildApiServer({ db });
    await cycleMigrations();
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  describe('/stats/inscriptions', () => {
    const bh = '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d';
    const ts = 1676913207000;

    describe('event processing', () => {
      const EXPECTED = {
        results: [
          {
            block_hash: bh,
            block_height: '778010',
            inscription_count: '3',
            inscription_count_accum: '9',
            timestamp: ts,
          },
          {
            block_hash: bh,
            block_height: '778005',
            inscription_count: '2',
            inscription_count_accum: '6',
            timestamp: ts,
          },
          {
            block_hash: bh,
            block_height: '778002',
            inscription_count: '1',
            inscription_count_accum: '4',
            timestamp: ts,
          },
          {
            block_hash: bh,
            block_height: '778001',
            inscription_count: '1',
            inscription_count_accum: '3',
            timestamp: ts,
          },
          {
            block_hash: bh,
            block_height: '778000',
            inscription_count: '2',
            inscription_count_accum: '2',
            timestamp: ts,
          },
        ],
      };

      test('returns stats when processing blocks in order', async () => {
        await db.updateInscriptions(testRevealApply(778_000));
        await db.updateInscriptions(testRevealApply(778_000));
        await db.updateInscriptions(testRevealApply(778_001));
        await db.updateInscriptions(testRevealApply(778_002));
        await db.updateInscriptions(testRevealApply(778_005));
        await db.updateInscriptions(testRevealApply(778_005));
        await db.updateInscriptions(testRevealApply(778_010));
        await db.updateInscriptions(testRevealApply(778_010));
        await db.updateInscriptions(testRevealApply(778_010));

        const response = await fastify.inject({
          method: 'GET',
          url: '/ordinals/v1/stats/inscriptions',
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toStrictEqual(EXPECTED);
      });

      test('returns stats when processing blocks out-of-order', async () => {
        await db.updateInscriptions(testRevealApply(778_001));
        await db.updateInscriptions(testRevealApply(778_010));
        await db.updateInscriptions(testRevealApply(778_000));
        await db.updateInscriptions(testRevealApply(778_000));
        await db.updateInscriptions(testRevealApply(778_005));
        await db.updateInscriptions(testRevealApply(778_010));
        await db.updateInscriptions(testRevealApply(778_002));
        await db.updateInscriptions(testRevealApply(778_010));
        await db.updateInscriptions(testRevealApply(778_005));

        const response = await fastify.inject({
          method: 'GET',
          url: '/ordinals/v1/stats/inscriptions',
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toStrictEqual(EXPECTED);
      });

      test('returns stats when processing rollbacks', async () => {
        const payloadApply = testRevealApply(778_004);
        const payloadRollback = { ...payloadApply, apply: [], rollback: payloadApply.apply };

        await db.updateInscriptions(testRevealApply(778_001));
        await db.updateInscriptions(testRevealApply(778_010));
        await db.updateInscriptions(testRevealApply(778_000));
        await db.updateInscriptions(payloadApply);
        await db.updateInscriptions(testRevealApply(778_005));
        await db.updateInscriptions(testRevealApply(778_000));
        await db.updateInscriptions(payloadRollback);
        await db.updateInscriptions(testRevealApply(778_010));
        await db.updateInscriptions(testRevealApply(778_002));
        await db.updateInscriptions(testRevealApply(778_010));
        await db.updateInscriptions(testRevealApply(778_005));

        const response = await fastify.inject({
          method: 'GET',
          url: '/ordinals/v1/stats/inscriptions',
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toStrictEqual(EXPECTED);
      });
    });

    test('range filters', async () => {
      await db.updateInscriptions(testRevealApply(778_000));
      await db.updateInscriptions(testRevealApply(778_001));
      await db.updateInscriptions(testRevealApply(778_002));
      await db.updateInscriptions(testRevealApply(778_005));
      await db.updateInscriptions(testRevealApply(778_005));
      await db.updateInscriptions(testRevealApply(778_010));

      const responseFrom = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/stats/inscriptions',
        query: { from_block_height: '778004' },
      });
      expect(responseFrom.statusCode).toBe(200);
      expect(responseFrom.json()).toStrictEqual({
        results: [
          {
            block_height: '778010',
            block_hash: bh,
            inscription_count: '1',
            inscription_count_accum: '6',
            timestamp: ts,
          },
          {
            block_height: '778005',
            block_hash: bh,
            inscription_count: '2',
            inscription_count_accum: '5',
            timestamp: ts,
          },
        ],
      });

      const responseTo = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/stats/inscriptions',
        query: { to_block_height: '778004' },
      });
      expect(responseTo.statusCode).toBe(200);
      expect(responseTo.json()).toStrictEqual({
        results: [
          {
            block_height: '778002',
            block_hash: bh,
            inscription_count: '1',
            inscription_count_accum: '3',
            timestamp: ts,
          },
          {
            block_height: '778001',
            block_hash: bh,
            inscription_count: '1',
            inscription_count_accum: '2',
            timestamp: ts,
          },
          {
            block_height: '778000',
            block_hash: bh,
            inscription_count: '1',
            inscription_count_accum: '1',
            timestamp: ts,
          },
        ],
      });

      const responseFromTo = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/stats/inscriptions',
        query: {
          from_block_height: '778002',
          to_block_height: '778005',
        },
      });
      expect(responseFromTo.statusCode).toBe(200);
      expect(responseFromTo.json()).toStrictEqual({
        results: [
          {
            block_height: '778005',
            block_hash: bh,
            inscription_count: '2',
            inscription_count_accum: '5',
            timestamp: ts,
          },
          {
            block_height: '778002',
            block_hash: bh,
            inscription_count: '1',
            inscription_count_accum: '3',
            timestamp: ts,
          },
        ],
      });
    });
  });
});

function testRevealApply(blockHeight: number) {
  const randomHex = randomHash();
  return new TestChainhookPayloadBuilder()
    .apply()
    .block({
      height: blockHeight,
      hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      timestamp: 1676913207,
    })
    .transaction({
      hash: `0x${randomHex}`,
    })
    .inscriptionRevealed({
      content_bytes: '0x48656C6C6F',
      content_type: 'image/png',
      content_length: 5,
      inscription_number: Math.floor(Math.random() * 100000),
      inscription_fee: 2805,
      inscription_id: `${randomHex}i0`,
      inscription_output_value: 10000,
      inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      ordinal_number: Math.floor(Math.random() * 1000000),
      ordinal_block_height: Math.floor(Math.random() * 777000),
      ordinal_offset: 0,
      satpoint_post_inscription: `${randomHex}:0:0`,
      inscription_input_index: 0,
      transfers_pre_inscription: 0,
      tx_index: 0,
    })
    .build();
}

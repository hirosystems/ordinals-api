import { cycleMigrations } from '@hirosystems/api-toolkit';
import { buildApiServer } from '../src/api/init';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { TestFastifyServer, testRevealApply } from './helpers';

describe('/stats', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await buildApiServer({ db });
    await cycleMigrations(MIGRATIONS_DIR);
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

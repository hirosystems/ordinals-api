import { buildApiServer } from '../src/api/init';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer } from './helpers';

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
    const EXPECTED = {
      results: [
        { block_height: '778000', inscription_count: '2', inscription_count_total: '2' },
        { block_height: '778001', inscription_count: '1', inscription_count_total: '3' },
        { block_height: '778002', inscription_count: '1', inscription_count_total: '4' },
        { block_height: '778005', inscription_count: '2', inscription_count_total: '6' },
        { block_height: '778010', inscription_count: '3', inscription_count_total: '9' },
      ],
    };

    test('returns stats when processing blocks in order', async () => {
      await db.updateInscriptions(testRevealBuilder(778_000).build());
      await db.updateInscriptions(testRevealBuilder(778_000).build());
      await db.updateInscriptions(testRevealBuilder(778_001).build());
      await db.updateInscriptions(testRevealBuilder(778_002).build());
      await db.updateInscriptions(testRevealBuilder(778_005).build());
      await db.updateInscriptions(testRevealBuilder(778_005).build());
      await db.updateInscriptions(testRevealBuilder(778_010).build());
      await db.updateInscriptions(testRevealBuilder(778_010).build());
      await db.updateInscriptions(testRevealBuilder(778_010).build());

      const response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/stats/inscriptions',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual(EXPECTED);
    });

    test('returns stats when processing blocks out-of-order', async () => {
      await db.updateInscriptions(testRevealBuilder(778_001).build());
      await db.updateInscriptions(testRevealBuilder(778_010).build());
      await db.updateInscriptions(testRevealBuilder(778_000).build());
      await db.updateInscriptions(testRevealBuilder(778_000).build());
      await db.updateInscriptions(testRevealBuilder(778_005).build());
      await db.updateInscriptions(testRevealBuilder(778_010).build());
      await db.updateInscriptions(testRevealBuilder(778_002).build());
      await db.updateInscriptions(testRevealBuilder(778_010).build());
      await db.updateInscriptions(testRevealBuilder(778_005).build());

      const response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/stats/inscriptions',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual(EXPECTED);
    });

    test('returns stats when processing rollbacks', async () => {
      const payloadApply = testRevealBuilder(778_004).build();
      const payloadRollback = { ...payloadApply, apply: [], rollback: payloadApply.apply };

      await db.updateInscriptions(testRevealBuilder(778_001).build());
      await db.updateInscriptions(testRevealBuilder(778_010).build());
      await db.updateInscriptions(testRevealBuilder(778_000).build());
      await db.updateInscriptions(payloadApply);
      await db.updateInscriptions(testRevealBuilder(778_005).build());
      await db.updateInscriptions(testRevealBuilder(778_000).build());
      await db.updateInscriptions(payloadRollback);
      await db.updateInscriptions(testRevealBuilder(778_010).build());
      await db.updateInscriptions(testRevealBuilder(778_002).build());
      await db.updateInscriptions(testRevealBuilder(778_010).build());
      await db.updateInscriptions(testRevealBuilder(778_005).build());

      const response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/stats/inscriptions',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual(EXPECTED);
    });
  });
});

function testRevealBuilder(blockHeight: number) {
  const randomHex = [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
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
      inscription_number: Math.floor(Math.random() * 100_000),
      inscription_fee: 2805,
      inscription_id: `${randomHex}i0`,
      inscription_output_value: 10000,
      inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      ordinal_number: Math.floor(Math.random() * 1_000_000),
      ordinal_block_height: Math.floor(Math.random() * 777_000),
      ordinal_offset: 0,
      satpoint_post_inscription: `${randomHex}:0:0`,
    });
}

import { buildApiServer } from '../src/api/init';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer } from './helpers';

describe('/sats', () => {
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

  test('returns valid sat', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/sats/10080000000001',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      coinbase_height: 2016,
      cycle: 0,
      decimal: '2016.1',
      degree: '0°2016′0″1‴',
      epoch: 0,
      name: 'ntwwidfrzxg',
      offset: 1,
      percentile: '0.48000000052804787%',
      period: 1,
      rarity: 'common',
    });
  });

  test('returns sat with inscription', async () => {
    await db.updateInscriptions(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 775617 })
        .transaction({ hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc' })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'image/png',
          content_length: 5,
          inscription_number: 7,
          inscription_fee: 2805,
          inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          inscription_output_value: 10000,
          inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          ordinal_number: 257418248345364,
          ordinal_block_height: 650000,
          ordinal_offset: 0,
          satpoint_post_inscription:
            '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
        })
        .build()
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/sats/257418248345364',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().inscription_id).toBe(
      '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'
    );
  });

  test('returns not found on invalid sats', async () => {
    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/sats/2099999997690000',
    });
    expect(response1.statusCode).toBe(400);

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/sats/-1',
    });
    expect(response2.statusCode).toBe(400);
  });
});

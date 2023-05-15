import { buildApiServer } from '../src/api/init';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer } from './helpers';

describe('Status', () => {
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

  test('returns status when db is empty', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/ordinals/v1/' });
    const json = response.json();
    expect(json).toStrictEqual({
      server_version: 'ordinals-api v0.0.1 (test:123456)',
      status: 'ready',
      block_height: 767430,
    });
    const noVersionResponse = await fastify.inject({ method: 'GET', url: '/ordinals/' });
    expect(response.statusCode).toEqual(noVersionResponse.statusCode);
    expect(json).toStrictEqual(noVersionResponse.json());
  });

  test('returns inscriptions total', async () => {
    await db.updateInscriptions(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 775617 })
        .transaction({ hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc' })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'text/plain;charset=utf-8',
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

    const response = await fastify.inject({ method: 'GET', url: '/ordinals/v1/' });
    const json = response.json();
    expect(json).toStrictEqual({
      server_version: 'ordinals-api v0.0.1 (test:123456)',
      status: 'ready',
      block_height: 775617,
      max_inscription_number: 7,
    });
  });
});

import { runMigrations } from '@hirosystems/api-toolkit';
import { buildApiServer } from '../src/api/init';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer } from './helpers';

describe('Status', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    await runMigrations(MIGRATIONS_DIR, 'up');
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await buildApiServer({ db });
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
    await runMigrations(MIGRATIONS_DIR, 'down');
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
          inscription_number: { classic: 0, jubilee: 0 },
          inscription_fee: 2805,
          inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          inscription_output_value: 10000,
          inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          ordinal_number: 257418248345364,
          ordinal_block_height: 650000,
          ordinal_offset: 0,
          satpoint_post_inscription:
            '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
          inscription_input_index: 0,
          transfers_pre_inscription: 0,
          tx_index: 0,
          curse_type: null,
        })
        .build()
    );
    await db.updateInscriptions(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 791975 })
        .transaction({ hash: 'a98d7055a77fa0b96cc31e30bb8bacf777382d1b67f1b7eca6f2014e961591c8' })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'text/plain;charset=utf-8',
          content_length: 5,
          inscription_number: { classic: -2, jubilee: -2 },
          inscription_fee: 2805,
          inscription_id: 'a98d7055a77fa0b96cc31e30bb8bacf777382d1b67f1b7eca6f2014e961591c8i0',
          inscription_output_value: 10000,
          inscriber_address: 'bc1pk6y72s45lcaurfwxrjyg7cf9xa9ezzuc8f5hhhzhtvhe5fgygckq0t0m5f',
          ordinal_number: 257418248345364,
          ordinal_block_height: 650000,
          ordinal_offset: 0,
          satpoint_post_inscription:
            'a98d7055a77fa0b96cc31e30bb8bacf777382d1b67f1b7eca6f2014e961591c8:0:0',
          curse_type: 'p2wsh',
          inscription_input_index: 0,
          transfers_pre_inscription: 0,
          tx_index: 0,
        })
        .build()
    );

    const response = await fastify.inject({ method: 'GET', url: '/ordinals/v1/' });
    const json = response.json();
    expect(json).toStrictEqual({
      server_version: 'ordinals-api v0.0.1 (test:123456)',
      status: 'ready',
      block_height: 791975,
      max_inscription_number: 0,
      max_cursed_inscription_number: -2,
    });
  });
});

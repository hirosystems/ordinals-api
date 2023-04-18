import { buildApiServer } from '../src/api/init';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestFastifyServer } from './helpers';

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
    await db.insertInscriptionGenesis({
      inscription: {
        genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        mime_type: 'image/png',
        content_type: 'image/png',
        content_length: 5,
        number: 7,
        content: '0x48656C6C6F',
        fee: '2805',
      },
      location: {
        genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        block_height: 775617,
        block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        output: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0',
        offset: '0',
        value: '10000',
        timestamp: 1676913207,
        sat_ordinal: '257418248345364',
        sat_rarity: 'common',
        sat_coinbase_height: 650000,
      },
    });

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

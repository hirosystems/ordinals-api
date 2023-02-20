import { buildApiServer } from '../src/api/init';
import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestFastifyServer } from './helpers';

describe('/inscriptions', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await buildApiServer({ db });
    await cycleMigrations();
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  test('shows inscription', async () => {
    await db.insertInscription({
      values: {
        inscription_id: 'ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
        offset: 0,
        block_height: 775796,
        block_hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79',
        address: 'bc1p3rfd76c37af87e23g4z6tts0zu52u6frjh92m9uq5evxy0sr7hvslly59y',
        sat_ordinal: 1914287520444193,
        sat_point: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79:0:0',
        fee: 151788,
        content_type: 'text/plain;charset=utf-8',
        content_length: 5,
        content: '0x48656C6C6F',
        timestamp: 1676913207,
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/inscriptions/ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      address: 'bc1p3rfd76c37af87e23g4z6tts0zu52u6frjh92m9uq5evxy0sr7hvslly59y',
      block_hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      block_height: 775796,
      content_length: 5,
      content_type: 'text/plain;charset=utf-8',
      fee: 151788,
      id: 'ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
      offset: 0,
      sat_ordinal: '1914287520444193',
      sat_point: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79:0:0',
      timestamp: 1676913207,
      tx_id: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79',
    });
  });

  test('returns not found for invalid inscriptions', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/inscriptions/ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
    });
    expect(response.statusCode).toBe(404);
  });
});

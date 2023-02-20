import { buildApiServer } from '../src/api/init';
import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestFastifyServer } from './helpers';

describe('/sats', () => {
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

  test('returns valid sat', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/sats/10080000000001',
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

  test('returns not found on invalid sats', async () => {
    const response1 = await fastify.inject({
      method: 'GET',
      url: '/sats/2099999997690000',
    });
    expect(response1.statusCode).toBe(400);

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/sats/-1',
    });
    expect(response2.statusCode).toBe(400);
  });
});

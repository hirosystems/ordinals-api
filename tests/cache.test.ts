import { buildApiServer } from '../src/api/init';
import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestFastifyServer } from './helpers';

describe('ETag cache', () => {
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

  test('inscription cache control', async () => {
    await db.insertInscriptionGenesis({
      inscription: {
        genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        mime_type: 'image/png',
        content_type: 'image/png',
        content_length: 5,
        number: 7,
        content: '0x48656C6C6F',
        fee: 2805n,
      },
      location: {
        inscription_id: 0,
        block_height: 775617,
        block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        output: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'common',
        sat_coinbase_height: 650000,
        genesis: true,
        current: true,
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).not.toBeUndefined();
    const etag = response.headers.etag;

    // Check on numbered id too
    const nResponse = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/7',
    });
    expect(nResponse.statusCode).toBe(200);
    expect(nResponse.headers.etag).not.toBeUndefined();
    const nEtag = nResponse.headers.etag;
    expect(nEtag).toBe(etag);

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      headers: { 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);
    const nCached = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/7',
      headers: { 'if-none-match': etag },
    });
    expect(nCached.statusCode).toBe(304);

    // Simulate modified location and check status code
    await db.sql`UPDATE locations SET timestamp = NOW() WHERE true`;
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      headers: { 'if-none-match': etag },
    });
    expect(cached2.statusCode).toBe(200);
    const nCached2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/7',
      headers: { 'if-none-match': etag },
    });
    expect(nCached2.statusCode).toBe(200);
  });

  test('inscriptions index cache control', async () => {
    await db.insertInscriptionGenesis({
      inscription: {
        genesis_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201i0',
        mime_type: 'text/plain',
        content_type: 'text/plain;charset=utf-8',
        content_length: 5,
        number: 7,
        content: '0x48656C6C6F',
        fee: 705n,
      },
      location: {
        inscription_id: 0,
        block_height: 778575,
        block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
        address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
        output: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'common',
        sat_coinbase_height: 650000,
        genesis: true,
        current: true,
      },
    });
    await db.insertInscriptionGenesis({
      inscription: {
        genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        mime_type: 'image/png',
        content_type: 'image/png',
        content_length: 5,
        number: 2,
        content: '0x48656C6C6F',
        fee: 2805n,
      },
      location: {
        inscription_id: 0,
        block_height: 775617,
        block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        output: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'common',
        sat_coinbase_height: 650000,
        genesis: true,
        current: true,
      },
    });

    // ETag response
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).not.toBeUndefined();
    const etag = response.headers.etag;

    // Cached
    const cached = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions',
      headers: { 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);

    // Simulate new location
    await db.updateInscriptionLocation({
      location: {
        inscription_id: 2,
        block_height: 775618,
        block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a9ff',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        output: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0',
        offset: 0n,
        value: 102n,
        timestamp: 1676913207,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'common',
        sat_coinbase_height: 20000,
        genesis: false,
        current: true,
      },
    });
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions',
      headers: { 'if-none-match': etag },
    });
    expect(cached2.statusCode).toBe(200);
  });
});

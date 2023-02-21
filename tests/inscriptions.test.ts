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
        sat_rarity: 'common',
        fee: 151788,
        mime_type: 'text/plain',
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
      mime_type: 'text/plain',
      content_type: 'text/plain;charset=utf-8',
      fee: 151788,
      id: 'ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
      offset: 0,
      sat_ordinal: '1914287520444193',
      sat_point: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79:0:0',
      sat_rarity: 'common',
      timestamp: 1676913207,
      tx_id: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79',
    });
  });

  test('index filtered by mime type', async () => {
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
        sat_rarity: 'common',
        fee: 151788,
        mime_type: 'text/plain',
        content_type: 'text/plain;charset=utf-8',
        content_length: 5,
        content: '0x48656C6C6F',
        timestamp: 1676913207,
      },
    });
    await db.insertInscription({
      values: {
        inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        offset: 0,
        block_height: 775617,
        block_hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        sat_ordinal: 257418248345364,
        sat_point: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
        sat_rarity: 'common',
        fee: 151788,
        mime_type: 'image/png',
        content_type: 'image/png',
        content_length: 5,
        content: '0x48656C6C6F',
        timestamp: 1676913207,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/inscriptions?mime_type=text/plain',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(1);
    const result1 = {
      address: 'bc1p3rfd76c37af87e23g4z6tts0zu52u6frjh92m9uq5evxy0sr7hvslly59y',
      block_hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      block_height: 775796,
      content_length: 5,
      mime_type: 'text/plain',
      content_type: 'text/plain;charset=utf-8',
      fee: 151788,
      id: 'ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
      offset: 0,
      sat_ordinal: '1914287520444193',
      sat_point: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79:0:0',
      sat_rarity: 'common',
      timestamp: 1676913207,
      tx_id: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79',
    };
    expect(responseJson1.results[0]).toStrictEqual(result1);

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/inscriptions?mime_type=image/png',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(1);
    const result2 = {
      id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      offset: 0,
      block_height: 775617,
      block_hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      tx_id: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      sat_ordinal: '257418248345364',
      sat_point: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
      sat_rarity: 'common',
      fee: 151788,
      mime_type: 'image/png',
      content_type: 'image/png',
      content_length: 5,
      timestamp: 1676913207,
    };
    expect(responseJson2.results[0]).toStrictEqual(result2);

    const response3 = await fastify.inject({
      method: 'GET',
      url: '/inscriptions?mime_type=image/png&mime_type=text/plain',
    });
    expect(response3.statusCode).toBe(200);
    const responseJson3 = response3.json();
    expect(responseJson3.total).toBe(2);
    expect(responseJson3.results[0]).toStrictEqual(result1);
    expect(responseJson3.results[1]).toStrictEqual(result2);
  });

  test('index filtered by sat rarity', async () => {
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
        sat_rarity: 'common',
        fee: 151788,
        mime_type: 'text/plain',
        content_type: 'text/plain;charset=utf-8',
        content_length: 5,
        content: '0x48656C6C6F',
        timestamp: 1676913207,
      },
    });
    await db.insertInscription({
      values: {
        inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        offset: 0,
        block_height: 775617,
        block_hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        sat_ordinal: 257418248345364,
        sat_point: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
        sat_rarity: 'epic',
        fee: 151788,
        mime_type: 'image/png',
        content_type: 'image/png',
        content_length: 5,
        content: '0x48656C6C6F',
        timestamp: 1676913207,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/inscriptions?rarity=common',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(1);
    const result1 = {
      address: 'bc1p3rfd76c37af87e23g4z6tts0zu52u6frjh92m9uq5evxy0sr7hvslly59y',
      block_hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      block_height: 775796,
      content_length: 5,
      mime_type: 'text/plain',
      content_type: 'text/plain;charset=utf-8',
      fee: 151788,
      id: 'ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
      offset: 0,
      sat_ordinal: '1914287520444193',
      sat_point: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79:0:0',
      sat_rarity: 'common',
      timestamp: 1676913207,
      tx_id: '0xff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79',
    };
    expect(responseJson1.results[0]).toStrictEqual(result1);

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/inscriptions?rarity=epic',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(1);
    const result2 = {
      id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      offset: 0,
      block_height: 775617,
      block_hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      tx_id: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      sat_ordinal: '257418248345364',
      sat_point: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
      sat_rarity: 'epic',
      fee: 151788,
      mime_type: 'image/png',
      content_type: 'image/png',
      content_length: 5,
      timestamp: 1676913207,
    };
    expect(responseJson2.results[0]).toStrictEqual(result2);
  });

  test('returns not found for invalid inscriptions', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/inscriptions/ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
    });
    expect(response.statusCode).toBe(404);
  });
});

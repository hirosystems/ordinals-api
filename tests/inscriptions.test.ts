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
        genesis: true,
        current: true,
      },
    });
    const expected = {
      address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      genesis_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      genesis_block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      genesis_block_height: 775617,
      content_length: 5,
      mime_type: 'image/png',
      content_type: 'image/png',
      genesis_fee: '2805',
      id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      offset: '0',
      number: 7,
      value: '10000',
      sat_ordinal: '257418248345364',
      output: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0',
      location: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
      sat_rarity: 'common',
      timestamp: 1676913207000,
      genesis_timestamp: 1676913207000,
      genesis_tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
    };

    // By inscription id
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual(expected);

    // By inscription number
    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/7',
    });
    expect(response2.statusCode).toBe(200);
    expect(response2.json()).toStrictEqual(expected);
  });

  test('index filtered by mime type', async () => {
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
        number: 1,
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
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?mime_type=text/plain',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(1);
    const result1 = {
      address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
      genesis_address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
      genesis_block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      genesis_block_height: 778575,
      content_length: 5,
      mime_type: 'text/plain',
      content_type: 'text/plain;charset=utf-8',
      genesis_fee: '705',
      id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201i0',
      offset: '0',
      number: 7,
      value: '10000',
      sat_ordinal: '257418248345364',
      output: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0',
      location: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0:0',
      sat_rarity: 'common',
      timestamp: 1676913207000,
      genesis_timestamp: 1676913207000,
      genesis_tx_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
    };
    expect(responseJson1.results[0]).toStrictEqual(result1);

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?mime_type=image/png',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(1);
    const result2 = {
      address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      genesis_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      genesis_block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      genesis_block_height: 775617,
      content_length: 5,
      mime_type: 'image/png',
      content_type: 'image/png',
      genesis_fee: '2805',
      id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      offset: '0',
      number: 1,
      value: '10000',
      sat_ordinal: '257418248345364',
      output: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0',
      location: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
      sat_rarity: 'common',
      timestamp: 1676913207000,
      genesis_timestamp: 1676913207000,
      genesis_tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
    };
    expect(responseJson2.results[0]).toStrictEqual(result2);

    const response3 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?mime_type=image/png&mime_type=text/plain',
    });
    expect(response3.statusCode).toBe(200);
    const responseJson3 = response3.json();
    expect(responseJson3.total).toBe(2);
    expect(responseJson3.results[0]).toStrictEqual(result1);
    expect(responseJson3.results[1]).toStrictEqual(result2);
  });

  test('index filtered by sat rarity', async () => {
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
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?rarity=common',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(1);
    expect(responseJson1.results[0].sat_rarity).toBe('common');

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?rarity=epic',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(1);
    expect(responseJson2.results[0].sat_rarity).toBe('epic');

    const response3 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?rarity=epic&rarity=common',
    });
    expect(response3.statusCode).toBe(200);
    const responseJson3 = response3.json();
    expect(responseJson3.total).toBe(2);
  });

  test('index filtered by block height', async () => {
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
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?genesis_block=775617',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(1);
    expect(responseJson1.results[0].genesis_block_height).toBe(775617);

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?from_genesis_block_height=778000',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(1);
    expect(responseJson2.results[0].genesis_block_height).toBe(778575);

    const response3 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?to_genesis_block_height=778000',
    });
    expect(response3.statusCode).toBe(200);
    const responseJson3 = response3.json();
    expect(responseJson3.total).toBe(1);
    expect(responseJson3.results[0].genesis_block_height).toBe(775617);
  });

  test('index filtered by block hash', async () => {
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
        block_hash: '000000000000000000039b3051705a16fcf310a70dee55742339e6da70181bf7',
        tx_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
        address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
        output: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'common',
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
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?genesis_block=000000000000000000039b3051705a16fcf310a70dee55742339e6da70181bf7',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(1);
    expect(responseJson1.results[0].genesis_block_hash).toBe(
      '000000000000000000039b3051705a16fcf310a70dee55742339e6da70181bf7'
    );
  });

  test('index filtered by timestamp range', async () => {
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
        timestamp: 1677731361,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'common',
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
        timestamp: 1675312161,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?from_genesis_timestamp=1675571361',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(1);
    expect(responseJson2.results[0].genesis_timestamp).toBe(1677731361000);

    const response3 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?to_genesis_timestamp=1675571361',
    });
    expect(response3.statusCode).toBe(200);
    const responseJson3 = response3.json();
    expect(responseJson3.total).toBe(1);
    expect(responseJson3.results[0].genesis_timestamp).toBe(1675312161000);
  });

  test('index filtered by output', async () => {
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
        block_hash: '000000000000000000039b3051705a16fcf310a70dee55742339e6da70181bf7',
        tx_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
        address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
        output: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'common',
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
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?output=9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(1);
    expect(responseJson1.results[0].output).toBe(
      '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0'
    );
  });

  test('index filtered by address', async () => {
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
        block_hash: '000000000000000000039b3051705a16fcf310a70dee55742339e6da70181bf7',
        tx_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
        address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
        output: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 257418248345364n,
        sat_rarity: 'common',
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
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?address=bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(1);
    expect(responseJson1.results[0].address).toBe(
      'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj'
    );
  });

  test('index ordered by sat rarity', async () => {
    await db.insertInscriptionGenesis({
      inscription: {
        genesis_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201i0',
        mime_type: 'text/plain',
        content_type: 'text/plain;charset=utf-8',
        content_length: 5,
        content: '0x48656C6C6F',
        number: 7,
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
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });
    await db.insertInscriptionGenesis({
      inscription: {
        genesis_id: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1i0',
        mime_type: 'image/png',
        content_type: 'image/png',
        content_length: 5,
        number: 7,
        content: '0x48656C6C6F',
        fee: 2805n,
      },
      location: {
        inscription_id: 0,
        block_height: 778583,
        block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1',
        address: 'bc1pxq6t85qp57aw8yf8eh9t7vsgd9zm5a8372rdll5jzrmc3cxqdpmqfucdry',
        output: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 0n,
        sat_rarity: 'mythic',
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?order_by=rarity&order=asc',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(3);
    expect(responseJson1.results[0].sat_rarity).toStrictEqual('common');
    expect(responseJson1.results[1].sat_rarity).toStrictEqual('epic');
    expect(responseJson1.results[2].sat_rarity).toStrictEqual('mythic');

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?order_by=rarity&order=desc',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(3);
    expect(responseJson2.results[0].sat_rarity).toStrictEqual('mythic');
    expect(responseJson2.results[1].sat_rarity).toStrictEqual('epic');
    expect(responseJson2.results[2].sat_rarity).toStrictEqual('common');
  });

  test('index ordered by sat ordinal', async () => {
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
        sat_ordinal: 3n,
        sat_rarity: 'common',
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
        sat_ordinal: 5n,
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });
    await db.insertInscriptionGenesis({
      inscription: {
        genesis_id: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1i0',
        mime_type: 'image/png',
        content_type: 'image/png',
        content_length: 5,
        number: 7,
        content: '0x48656C6C6F',
        fee: 2805n,
      },
      location: {
        inscription_id: 0,
        block_height: 778583,
        block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1',
        address: 'bc1pxq6t85qp57aw8yf8eh9t7vsgd9zm5a8372rdll5jzrmc3cxqdpmqfucdry',
        output: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 0n,
        sat_rarity: 'mythic',
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?order_by=ordinal&order=asc',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(3);
    expect(responseJson1.results[0].sat_ordinal).toStrictEqual('0');
    expect(responseJson1.results[1].sat_ordinal).toStrictEqual('3');
    expect(responseJson1.results[2].sat_ordinal).toStrictEqual('5');

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?order_by=ordinal&order=desc',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(3);
    expect(responseJson2.results[0].sat_ordinal).toStrictEqual('5');
    expect(responseJson2.results[1].sat_ordinal).toStrictEqual('3');
    expect(responseJson2.results[2].sat_ordinal).toStrictEqual('0');
  });

  test('index ordered by genesis block height', async () => {
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
        sat_ordinal: 3n,
        sat_rarity: 'common',
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
        sat_ordinal: 5n,
        sat_rarity: 'epic',
        genesis: true,
        current: true,
      },
    });
    await db.insertInscriptionGenesis({
      inscription: {
        genesis_id: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1i0',
        mime_type: 'image/png',
        content_type: 'image/png',
        content_length: 5,
        number: 7,
        content: '0x48656C6C6F',
        fee: 2805n,
      },
      location: {
        inscription_id: 0,
        block_height: 778583,
        block_hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
        tx_id: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1',
        address: 'bc1pxq6t85qp57aw8yf8eh9t7vsgd9zm5a8372rdll5jzrmc3cxqdpmqfucdry',
        output: '567c7605439dfdc3a289d13fd2132237852f4a56e784b9364ba94499d5f9baf1:0',
        offset: 0n,
        value: 10000n,
        timestamp: 1676913207,
        sat_ordinal: 0n,
        sat_rarity: 'mythic',
        genesis: true,
        current: true,
      },
    });

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?order_by=genesis_block_height&order=asc',
    });
    expect(response1.statusCode).toBe(200);
    const responseJson1 = response1.json();
    expect(responseJson1.total).toBe(3);
    expect(responseJson1.results[0].genesis_block_height).toStrictEqual(775617);
    expect(responseJson1.results[1].genesis_block_height).toStrictEqual(778575);
    expect(responseJson1.results[2].genesis_block_height).toStrictEqual(778583);

    const response2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions?order_by=genesis_block_height&order=desc',
    });
    expect(response2.statusCode).toBe(200);
    const responseJson2 = response2.json();
    expect(responseJson2.total).toBe(3);
    expect(responseJson2.results[0].genesis_block_height).toStrictEqual(778583);
    expect(responseJson2.results[1].genesis_block_height).toStrictEqual(778575);
    expect(responseJson2.results[2].genesis_block_height).toStrictEqual(775617);
  });

  test('returns not found for invalid inscriptions', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/ff4503ab9048d6d0ff4e23def81b614d5270d341ce993992e93902ceb0d4ed79i0',
    });
    expect(response.statusCode).toBe(404);
  });
});

import { runMigrations } from '@hirosystems/api-toolkit';
import { buildApiServer } from '../src/api/init';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer, randomHash } from './helpers';

describe('ETag cache', () => {
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

  test('inscription cache control', async () => {
    const block = new TestChainhookPayloadBuilder()
      .apply()
      .block({ height: 775617 })
      .transaction({ hash: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc' })
      .inscriptionRevealed({
        content_bytes: '0x48656C6C6F',
        content_type: 'image/png',
        content_length: 5,
        inscription_number: {
          classic: 0,
          jubilee: 0,
        },
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
      .build();
    await db.updateInscriptions(block);
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).not.toBeUndefined();
    const etag1 = response.headers.etag;

    // Check on numbered id too
    const nResponse = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/0',
    });
    expect(nResponse.statusCode).toBe(200);
    expect(nResponse.headers.etag).not.toBeUndefined();
    const nEtag = nResponse.headers.etag;
    expect(nEtag).toBe(etag1);

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      headers: { 'if-none-match': etag1 },
    });
    expect(cached.statusCode).toBe(304);
    const nCached = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/0',
      headers: { 'if-none-match': etag1 },
    });
    expect(nCached.statusCode).toBe(304);

    // Perform transfer and check cache
    await db.updateInscriptions(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 775618, timestamp: 1678122360 })
        .transaction({
          hash: '0xbdda0d240132bab2af7f797d1507beb1acab6ad43e2c0ef7f96291aea5cc3444',
        })
        .inscriptionTransferred({
          ordinal_number: 257418248345364,
          destination: {
            type: 'transferred',
            value: 'bc1p3xqwzmddceqrd6x9yxplqzkl5vucta2gqm5szpkmpuvcvgs7g8psjf8htd',
          },
          satpoint_pre_transfer:
            'da2da520f055e9fadaf1a78b3e01bc53596dcbb88e9c9f53bcb61b98310b1006:0:0',
          satpoint_post_transfer:
            'bdda0d240132bab2af7f797d1507beb1acab6ad43e2c0ef7f96291aea5cc3444:0:0',
          post_transfer_output_value: 8000,
          tx_index: 0,
        })
        .build()
    );
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      headers: { 'if-none-match': etag1 },
    });
    expect(cached2.statusCode).toBe(200);
    const nCached2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/0',
      headers: { 'if-none-match': etag1 },
    });
    expect(nCached2.statusCode).toBe(200);
    const etag2 = cached2.headers.etag;

    // Perform transfer GAP FILL and check cache
    await db.updateInscriptions(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 775619, timestamp: 1678122360 })
        .transaction({
          hash: 'bebb1357c97d2348eb8ef24e1d8639ff79c8847bf12999ca7fef463489b40f0f',
        })
        .inscriptionTransferred({
          ordinal_number: 257418248345364,
          destination: {
            type: 'transferred',
            value: 'bc1p3xqwzmddceqrd6x9yxplqzkl5vucta2gqm5szpkmpuvcvgs7g8psjf8htd',
          },
          satpoint_pre_transfer:
            '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
          satpoint_post_transfer:
            'da2da520f055e9fadaf1a78b3e01bc53596dcbb88e9c9f53bcb61b98310b1006:0:0',
          post_transfer_output_value: 8000,
          tx_index: 0,
        })
        .build()
    );
    const cached3 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      headers: { 'if-none-match': etag2 },
    });
    expect(cached3.statusCode).toBe(200);
    const nCached3 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions/0',
      headers: { 'if-none-match': etag2 },
    });
    expect(nCached3.statusCode).toBe(200);
  });

  test('inscriptions index cache control', async () => {
    const block1 = new TestChainhookPayloadBuilder()
      .apply()
      .block({ height: 778575 })
      .transaction({ hash: '0x9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201' })
      .inscriptionRevealed({
        content_bytes: '0x48656C6C6F',
        content_type: 'text/plain',
        content_length: 5,
        inscription_number: {
          classic: 0,
          jubilee: 0,
        },
        inscription_fee: 705,
        inscription_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201i0',
        inscription_output_value: 10000,
        inscriber_address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
        ordinal_number: 257418248345364,
        ordinal_block_height: 650000,
        ordinal_offset: 0,
        satpoint_post_inscription:
          '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0:0',
        inscription_input_index: 0,
        transfers_pre_inscription: 0,
        tx_index: 0,
        curse_type: null,
      })
      .build();
    await db.updateInscriptions(block1);
    const block2 = new TestChainhookPayloadBuilder()
      .apply()
      .block({ height: 778576 })
      .transaction({ hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d' })
      .inscriptionRevealed({
        content_bytes: '0x48656C6C6F',
        content_type: 'image/png',
        content_length: 5,
        inscription_number: {
          classic: 1,
          jubilee: 1,
        },
        inscription_fee: 2805,
        inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        inscription_output_value: 10000,
        inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        ordinal_number: 1676913207,
        ordinal_block_height: 650000,
        ordinal_offset: 0,
        satpoint_post_inscription:
          '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
        inscription_input_index: 0,
        transfers_pre_inscription: 0,
        tx_index: 0,
        curse_type: null,
      })
      .build();
    await db.updateInscriptions(block2);

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

    // New location
    const block3 = new TestChainhookPayloadBuilder()
      .apply()
      .block({ height: 778577 })
      .transaction({ hash: 'ae9d273a10e899f0d2cad47ee2b0e77ab8a9addd9dd5bb5e4b03d6971c060d52' })
      .inscriptionTransferred({
        ordinal_number: 257418248345364,
        destination: {
          type: 'transferred',
          value: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        },
        satpoint_pre_transfer:
          '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
        satpoint_post_transfer:
          'ae9d273a10e899f0d2cad47ee2b0e77ab8a9addd9dd5bb5e4b03d6971c060d52:0:0',
        post_transfer_output_value: 100,
        tx_index: 0,
      })
      .build();
    await db.updateInscriptions(block3);
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/inscriptions',
      headers: { 'if-none-match': etag },
    });
    expect(cached2.statusCode).toBe(200);
  });

  test('inscriptions stats per block cache control', async () => {
    const block1 = new TestChainhookPayloadBuilder()
      .apply()
      .block({ height: 778575, hash: randomHash() })
      .transaction({ hash: '0x9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201' })
      .inscriptionRevealed({
        content_bytes: '0x48656C6C6F',
        content_type: 'text/plain',
        content_length: 5,
        inscription_number: {
          classic: 0,
          jubilee: 0,
        },
        inscription_fee: 705,
        inscription_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201i0',
        inscription_output_value: 10000,
        inscriber_address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
        ordinal_number: 257418248345364,
        ordinal_block_height: 650000,
        ordinal_offset: 0,
        satpoint_post_inscription:
          '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0:0',
        inscription_input_index: 0,
        transfers_pre_inscription: 0,
        tx_index: 0,
        curse_type: null,
      })
      .build();
    await db.updateInscriptions(block1);

    // ETag response
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/stats/inscriptions',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).not.toBeUndefined();
    const etag = response.headers.etag;

    // Cached
    const cached = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/stats/inscriptions',
      headers: { 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);

    // New block
    const block2 = new TestChainhookPayloadBuilder()
      .apply()
      .block({ height: 778576, hash: randomHash() })
      .transaction({ hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d' })
      .inscriptionRevealed({
        content_bytes: '0x48656C6C6F',
        content_type: 'image/png',
        content_length: 5,
        inscription_number: {
          classic: 1,
          jubilee: 1,
        },
        inscription_fee: 2805,
        inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        inscription_output_value: 10000,
        inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        ordinal_number: 1676913207,
        ordinal_block_height: 650000,
        ordinal_offset: 0,
        satpoint_post_inscription:
          '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
        inscription_input_index: 0,
        transfers_pre_inscription: 0,
        tx_index: 0,
        curse_type: null,
      })
      .build();
    await db.updateInscriptions(block2);

    // Cache busted
    const cacheBusted = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/stats/inscriptions',
      headers: { 'if-none-match': etag },
    });
    expect(cacheBusted.statusCode).toBe(200);
  });

  test('status etag changes with new block', async () => {
    const block1 = new TestChainhookPayloadBuilder()
      .apply()
      .block({ height: 778575, hash: randomHash() })
      .transaction({ hash: '0x9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201' })
      .inscriptionRevealed({
        content_bytes: '0x48656C6C6F',
        content_type: 'text/plain',
        content_length: 5,
        inscription_number: {
          classic: 0,
          jubilee: 0,
        },
        inscription_fee: 705,
        inscription_id: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201i0',
        inscription_output_value: 10000,
        inscriber_address: 'bc1pscktlmn99gyzlvymvrezh6vwd0l4kg06tg5rvssw0czg8873gz5sdkteqj',
        ordinal_number: 257418248345364,
        ordinal_block_height: 650000,
        ordinal_offset: 0,
        satpoint_post_inscription:
          '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201:0:0',
        inscription_input_index: 0,
        transfers_pre_inscription: 0,
        tx_index: 0,
        curse_type: null,
      })
      .build();
    await db.updateInscriptions(block1);

    // ETag response
    const response = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).not.toBeUndefined();
    const etag = response.headers.etag;

    // Cached
    const cached = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/',
      headers: { 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);

    // New block
    const block2 = new TestChainhookPayloadBuilder()
      .apply()
      .block({ height: 778576, hash: randomHash() })
      .transaction({ hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d' })
      .inscriptionRevealed({
        content_bytes: '0x48656C6C6F',
        content_type: 'image/png',
        content_length: 5,
        inscription_number: {
          classic: 1,
          jubilee: 1,
        },
        inscription_fee: 2805,
        inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        inscription_output_value: 10000,
        inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        ordinal_number: 1676913207,
        ordinal_block_height: 650000,
        ordinal_offset: 0,
        satpoint_post_inscription:
          '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
        inscription_input_index: 0,
        transfers_pre_inscription: 0,
        tx_index: 0,
        curse_type: null,
      })
      .build();
    await db.updateInscriptions(block2);

    // Cache busted
    const cacheBusted = await fastify.inject({
      method: 'GET',
      url: '/ordinals/v1/',
      headers: { 'if-none-match': etag },
    });
    expect(cacheBusted.statusCode).toBe(200);
  });
});

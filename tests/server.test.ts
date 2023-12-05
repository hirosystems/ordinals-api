import { PREDICATE_UUID, startOrdhookServer } from '../src/ordhook/server';
import { ENV } from '../src/env';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer } from './helpers';
import {
  BadPayloadRequestError,
  BitcoinInscriptionRevealed,
  BitcoinInscriptionTransferred,
  ChainhookEventObserver,
} from '@hirosystems/chainhook-client';
import { buildApiServer } from '../src/api/init';
import { runMigrations } from '@hirosystems/api-toolkit';

describe('EventServer', () => {
  let db: PgStore;
  let server: ChainhookEventObserver;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    await runMigrations(MIGRATIONS_DIR, 'up');
    ENV.CHAINHOOK_AUTO_PREDICATE_REGISTRATION = false;
    db = await PgStore.connect({ skipMigrations: true });
    server = await startOrdhookServer({ db });
    fastify = await buildApiServer({ db });
  });

  afterEach(async () => {
    await server.close();
    await fastify.close();
    await db.close();
    await runMigrations(MIGRATIONS_DIR, 'down');
  });

  describe('parser', () => {
    test('parses inscription_reveal apply and rollback', async () => {
      const reveal: BitcoinInscriptionRevealed = {
        content_bytes: '0x303030303030303030303030',
        content_type: 'text/plain;charset=utf-8',
        content_length: 12,
        inscription_number: 0,
        inscription_fee: 3425,
        inscription_output_value: 10000,
        inscription_id: '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0',
        inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        ordinal_number: 125348773618236,
        ordinal_block_height: 566462,
        ordinal_offset: 0,
        satpoint_post_inscription:
          '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0:0',
        inscription_input_index: 0,
        transfers_pre_inscription: 0,
        tx_index: 0,
        curse_type: null,
      };

      // Apply
      const payload1 = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 767430,
          hash: '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
          timestamp: 1676913207,
        })
        .transaction({
          hash: '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8',
        })
        .inscriptionRevealed(reveal)
        .build();
      const response = await server['fastify'].inject({
        method: 'POST',
        url: `/payload`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload1,
      });
      expect(response.statusCode).toBe(200);

      const query = await db.getInscriptions(
        {
          limit: 1,
          offset: 0,
        },
        { genesis_id: ['0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0'] }
      );
      const inscr = query.results[0];
      expect(inscr).not.toBeUndefined();
      expect(inscr.address).toBe('bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td');
      expect(inscr.content_length).toBe('12');
      expect(inscr.content_type).toBe('text/plain;charset=utf-8');
      expect(inscr.genesis_address).toBe(
        'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td'
      );
      expect(inscr.genesis_block_hash).toBe(
        '163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88'
      );
      expect(inscr.genesis_block_height).toBe('767430');
      expect(inscr.genesis_fee).toBe('3425');
      expect(inscr.genesis_id).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0'
      );
      expect(inscr.genesis_timestamp.toISOString()).toBe('2023-02-20T17:13:27.000Z');
      expect(inscr.genesis_tx_id).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8'
      );
      expect(inscr.mime_type).toBe('text/plain');
      expect(inscr.number).toBe('0');
      expect(inscr.offset).toBe('0');
      expect(inscr.output).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0'
      );
      expect(inscr.sat_coinbase_height).toBe('25069');
      expect(inscr.sat_ordinal).toBe('125348773618236');
      expect(inscr.sat_rarity).toBe('common');
      expect(inscr.timestamp.toISOString()).toBe('2023-02-20T17:13:27.000Z');
      expect(inscr.value).toBe('10000');

      // Rollback
      const payload2 = new TestChainhookPayloadBuilder()
        .rollback()
        .block({
          height: 107,
          hash: '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
          timestamp: 1676913207,
        })
        .transaction({
          hash: '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8',
        })
        .inscriptionRevealed(reveal)
        .build();
      const response2 = await server['fastify'].inject({
        method: 'POST',
        url: `/payload`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload2,
      });
      expect(response2.statusCode).toBe(200);
      const c1 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM inscriptions`;
      expect(c1[0].count).toBe(0);
      const c2 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM locations`;
      expect(c2[0].count).toBe(0);
    });

    test('parses inscription_transferred apply and rollback', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
            timestamp: 1676913207,
          })
          .transaction({
            hash: '0x38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed({
            content_bytes: '0x48656C6C6F',
            content_type: 'image/png',
            content_length: 5,
            inscription_number: 0,
            inscription_fee: 2805,
            inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
            inscription_output_value: 10000,
            inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            ordinal_number: 5,
            ordinal_block_height: 0,
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
      await expect(db.getChainTipBlockHeight()).resolves.toBe(775617);

      const transfer: BitcoinInscriptionTransferred = {
        inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        destination: {
          type: 'transferred',
          value: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf00000',
        },
        satpoint_pre_transfer:
          '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
        satpoint_post_transfer:
          '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0:5000',
        post_transfer_output_value: 10000,
        tx_index: 0,
      };

      // Apply
      const payload1 = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 775618,
          hash: '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
          timestamp: 1676913207,
        })
        .transaction({
          hash: '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8',
        })
        .inscriptionTransferred(transfer)
        .build();
      const response = await server['fastify'].inject({
        method: 'POST',
        url: `/payload`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload1,
      });
      expect(response.statusCode).toBe(200);
      await expect(db.getChainTipBlockHeight()).resolves.toBe(775618);
      const query = await db.getInscriptions(
        {
          limit: 1,
          offset: 0,
        },
        { genesis_id: ['38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'] }
      );
      const inscr = query.results[0];
      expect(inscr).not.toBeUndefined();
      expect(inscr.address).toBe('bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf00000');
      expect(inscr.content_length).toBe('5');
      expect(inscr.content_type).toBe('image/png');
      expect(inscr.genesis_address).toBe(
        'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td'
      );
      expect(inscr.genesis_block_hash).toBe(
        '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d'
      );
      expect(inscr.genesis_block_height).toBe('775617');
      expect(inscr.genesis_fee).toBe('2805');
      expect(inscr.genesis_id).toBe(
        '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0'
      );
      expect(inscr.genesis_timestamp.toISOString()).toBe('2023-02-20T17:13:27.000Z');
      expect(inscr.genesis_tx_id).toBe(
        '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc'
      );
      expect(inscr.mime_type).toBe('image/png');
      expect(inscr.number).toBe('0');
      expect(inscr.offset).toBe('5000');
      expect(inscr.output).toBe(
        '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0'
      );
      expect(inscr.sat_coinbase_height).toBe('0');
      expect(inscr.sat_ordinal).toBe('5');
      expect(inscr.sat_rarity).toBe('common');
      expect(inscr.timestamp.toISOString()).toBe('2023-02-20T17:13:27.000Z');
      expect(inscr.value).toBe('10000');

      // Rollback
      const payload2 = new TestChainhookPayloadBuilder()
        .rollback()
        .block({
          height: 775618,
          hash: '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
          timestamp: 1676913207,
        })
        .transaction({
          hash: '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8',
        })
        .inscriptionTransferred(transfer)
        .build();
      const response2 = await server['fastify'].inject({
        method: 'POST',
        url: `/payload`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload2,
      });
      expect(response2.statusCode).toBe(200);
      const c1 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM inscriptions`;
      expect(c1[0].count).toBe(1);
      const c2 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM locations`;
      expect(c2[0].count).toBe(1);
      await expect(db.getChainTipBlockHeight()).resolves.toBe(775617);
    });

    test('multiple inscription pointers on the same block are compared correctly', async () => {
      const address = 'bc1q92zytmqgczsrg4xuhpc2asz6h4h7ke5hagw8k6';
      const address2 = 'bc1qtpm0fsaawxjsthfdrxhmrzunnpjx0g9hncgvp7';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 808382,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: '6046f17804eb8396285567a20c09598ae1273b6f744b23700ba95593c380ce02',
          })
          .inscriptionRevealed({
            content_bytes: '0x48656C6C6F',
            content_type: 'image/png',
            content_length: 5,
            inscription_number: 0,
            inscription_fee: 2805,
            inscription_id: '6046f17804eb8396285567a20c09598ae1273b6f744b23700ba95593c380ce02i0',
            inscription_output_value: 10000,
            inscriber_address: address,
            ordinal_number: 5,
            ordinal_block_height: 0,
            ordinal_offset: 0,
            satpoint_post_inscription:
              '6046f17804eb8396285567a20c09598ae1273b6f744b23700ba95593c380ce02:0:0',
            inscription_input_index: 0,
            transfers_pre_inscription: 0,
            tx_index: 995,
            curse_type: null,
          })
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .inscriptionTransferred({
            inscription_id: '6046f17804eb8396285567a20c09598ae1273b6f744b23700ba95593c380ce02i0',
            destination: { type: 'transferred', value: address2 },
            satpoint_pre_transfer:
              '6046f17804eb8396285567a20c09598ae1273b6f744b23700ba95593c380ce02:0:0',
            satpoint_post_transfer:
              '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac:0:0',
            post_transfer_output_value: null,
            tx_index: 1019, // '1019' is less than '995' when compared as a string
          })
          .build()
      );
      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/inscriptions/6046f17804eb8396285567a20c09598ae1273b6f744b23700ba95593c380ce02i0`,
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.genesis_address).toBe(address);
    });
  });

  describe('gap detection', () => {
    test('server rejects payload with first inscription gap', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 778575,
            hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
            timestamp: 1676913207,
          })
          .transaction({
            hash: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
          })
          .inscriptionRevealed({
            content_bytes: '0x48656C6C6F',
            content_type: 'text/plain;charset=utf-8',
            content_length: 5,
            inscription_number: 0,
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
          .build()
      );
      const errorPayload = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 778576,
          hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          timestamp: 1676913207,
        })
        .transaction({
          hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'text/plain;charset=utf-8',
          content_length: 5,
          inscription_number: 5, // Gap at 5
          inscription_fee: 705,
          inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          inscription_output_value: 10000,
          inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          ordinal_number: 1050000000000000,
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
      await expect(db.updateInscriptions(errorPayload)).rejects.toThrow(BadPayloadRequestError);
      const response = await server['fastify'].inject({
        method: 'POST',
        url: `/payload`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: errorPayload,
      });
      expect(response.statusCode).toBe(400);
    });

    test('server rejects payload with intermediate inscription gap', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 778575,
            hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
            timestamp: 1676913207,
          })
          .transaction({
            hash: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
          })
          .inscriptionRevealed({
            content_bytes: '0x48656C6C6F',
            content_type: 'text/plain;charset=utf-8',
            content_length: 5,
            inscription_number: 0,
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
          .build()
      );
      const errorPayload = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 778576,
          hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          timestamp: 1676913207,
        })
        .transaction({
          hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'text/plain;charset=utf-8',
          content_length: 5,
          inscription_number: 1,
          inscription_fee: 705,
          inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          inscription_output_value: 10000,
          inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          ordinal_number: 1050000000000000,
          ordinal_block_height: 650000,
          ordinal_offset: 0,
          satpoint_post_inscription:
            '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
          inscription_input_index: 0,
          transfers_pre_inscription: 0,
          tx_index: 0,
          curse_type: null,
        })
        .transaction({
          hash: '6891d374a17ba85f6b5514f2f7edc301c1c860284dff5a5c6e88ab3a20fcd8a5',
        })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'text/plain;charset=utf-8',
          content_length: 5,
          inscription_number: 4, // Gap
          inscription_fee: 705,
          inscription_id: '6891d374a17ba85f6b5514f2f7edc301c1c860284dff5a5c6e88ab3a20fcd8a5o0',
          inscription_output_value: 10000,
          inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          ordinal_number: 1050000000000000,
          ordinal_block_height: 650000,
          ordinal_offset: 0,
          satpoint_post_inscription:
            '6891d374a17ba85f6b5514f2f7edc301c1c860284dff5a5c6e88ab3a20fcd8a5:0:0',
          inscription_input_index: 0,
          transfers_pre_inscription: 0,
          tx_index: 0,
          curse_type: null,
        })
        .build();
      await expect(db.updateInscriptions(errorPayload)).rejects.toThrow(BadPayloadRequestError);
      const response = await server['fastify'].inject({
        method: 'POST',
        url: `/payload`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: errorPayload,
      });
      expect(response.statusCode).toBe(400);
    });

    test('server accepts payload with unordered unbound inscriptions', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 778575,
            hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
            timestamp: 1676913207,
          })
          .transaction({
            hash: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
          })
          .inscriptionRevealed({
            content_bytes: '0x48656C6C6F',
            content_type: 'text/plain;charset=utf-8',
            content_length: 5,
            inscription_number: 0,
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
          .build()
      );
      const unboundPayload = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 778576,
          hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          timestamp: 1676913207,
        })
        .transaction({
          hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'text/plain;charset=utf-8',
          content_length: 5,
          inscription_number: 2,
          inscription_fee: 705,
          inscription_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          inscription_output_value: 10000,
          inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          ordinal_number: 1050000000000000,
          ordinal_block_height: 650000,
          ordinal_offset: 0,
          satpoint_post_inscription:
            '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc:0:0',
          inscription_input_index: 0,
          transfers_pre_inscription: 0,
          tx_index: 0,
          curse_type: null,
        })
        .transaction({
          hash: '6891d374a17ba85f6b5514f2f7edc301c1c860284dff5a5c6e88ab3a20fcd8a5',
        })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'text/plain;charset=utf-8',
          content_length: 5,
          inscription_number: 1,
          inscription_fee: 705,
          inscription_id: '6891d374a17ba85f6b5514f2f7edc301c1c860284dff5a5c6e88ab3a20fcd8a5o0',
          inscription_output_value: 10000,
          inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          ordinal_number: 0, // Unbounded
          ordinal_block_height: 650000,
          ordinal_offset: 0,
          satpoint_post_inscription:
            '6891d374a17ba85f6b5514f2f7edc301c1c860284dff5a5c6e88ab3a20fcd8a5:0:0',
          inscription_input_index: 0,
          transfers_pre_inscription: 0,
          tx_index: 0,
          curse_type: null,
        })
        .build();
      await expect(db.updateInscriptions(unboundPayload)).resolves.not.toThrow(
        BadPayloadRequestError
      );
    });

    test('server ignores past blocks', async () => {
      const payload = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 778575,
          hash: '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          timestamp: 1676913207,
        })
        .transaction({
          hash: '9f4a9b73b0713c5da01c0a47f97c6c001af9028d6bdd9e264dfacbc4e6790201',
        })
        .inscriptionRevealed({
          content_bytes: '0x48656C6C6F',
          content_type: 'text/plain;charset=utf-8',
          content_length: 5,
          inscription_number: 0,
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
      await db.updateInscriptions(payload);

      const response = await server['fastify'].inject({
        method: 'POST',
        url: `/payload`,
        headers: { authorization: `Bearer ${ENV.CHAINHOOK_NODE_AUTH_TOKEN}` },
        payload: payload,
      });
      expect(response.statusCode).toBe(200);
    });
  });
});

import { cycleMigrations } from '@hirosystems/api-toolkit';
import { buildApiServer } from '../src/api/init';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { DbInscriptionInsert } from '../src/pg/types';
import { TestChainhookPayloadBuilder, TestFastifyServer, brc20Reveal } from './helpers';
import { brc20FromInscription } from '../src/pg/brc20/helpers';

describe('BRC-20', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await buildApiServer({ db });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  describe('token standard validation', () => {
    const testInsert = (json: any): DbInscriptionInsert => {
      const content = Buffer.from(JSON.stringify(json), 'utf-8');
      const insert: DbInscriptionInsert = {
        genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        number: 1,
        mime_type: 'application/json',
        content_type: 'application/json',
        content_length: content.length,
        content: `0x${content.toString('hex')}`,
        fee: '200',
        curse_type: null,
        sat_ordinal: '2000000',
        sat_rarity: 'common',
        sat_coinbase_height: 110,
      };
      return insert;
    };

    test('ignores incorrect MIME type', () => {
      const content = Buffer.from(
        JSON.stringify({
          p: 'brc-20',
          op: 'deploy',
          tick: 'PEPE',
          max: '21000000',
        }),
        'utf-8'
      );
      const insert: DbInscriptionInsert = {
        genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        number: 1,
        mime_type: 'foo/bar',
        content_type: 'foo/bar;x=1',
        content_length: content.length,
        content: `0x${content.toString('hex')}`,
        fee: '200',
        curse_type: null,
        sat_ordinal: '2000000',
        sat_rarity: 'common',
        sat_coinbase_height: 110,
      };
      expect(brc20FromInscription(insert)).toBeUndefined();
      insert.content_type = 'application/json';
      insert.mime_type = 'application/json';
      expect(brc20FromInscription(insert)).not.toBeUndefined();
      insert.content_type = 'text/plain;charset=utf-8';
      insert.mime_type = 'text/plain';
      expect(brc20FromInscription(insert)).not.toBeUndefined();
    });

    test('ignores invalid JSON', () => {
      const content = Buffer.from(
        '{"p": "brc-20", "op": "deploy", "tick": "PEPE", "max": "21000000"',
        'utf-8'
      );
      const insert: DbInscriptionInsert = {
        genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        number: 1,
        mime_type: 'application/json',
        content_type: 'application/json',
        content_length: content.length,
        content: `0x${content.toString('hex')}`,
        fee: '200',
        curse_type: null,
        sat_ordinal: '2000000',
        sat_rarity: 'common',
        sat_coinbase_height: 110,
      };
      expect(brc20FromInscription(insert)).toBeUndefined();
    });

    test('ignores incorrect p field', () => {
      const insert = testInsert({
        p: 'brc20', // incorrect
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
      });
      expect(brc20FromInscription(insert)).toBeUndefined();
    });

    test('ignores incorrect op field', () => {
      const insert = testInsert({
        p: 'brc-20',
        op: 'deploi', // incorrect
        tick: 'PEPE',
        max: '21000000',
      });
      expect(brc20FromInscription(insert)).toBeUndefined();
    });

    test('tick must be 4 bytes wide', () => {
      const insert = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPETESTER', // more than 4 bytes
        max: '21000000',
      });
      expect(brc20FromInscription(insert)).toBeUndefined();
      const insert2 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'Pe P', // valid
        max: '21000000',
      });
      expect(brc20FromInscription(insert2)).not.toBeUndefined();
      const insert3 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: '🤬😉', // more than 4 bytes
        max: '21000000',
      });
      expect(brc20FromInscription(insert3)).toBeUndefined();
    });

    test('all fields must be strings', () => {
      const insert1 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: 21000000,
      });
      expect(brc20FromInscription(insert1)).toBeUndefined();
      const insert1a = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: 300,
      });
      expect(brc20FromInscription(insert1a)).toBeUndefined();
      const insert1b = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '300',
        dec: 2,
      });
      expect(brc20FromInscription(insert1b)).toBeUndefined();
      const insert2 = testInsert({
        p: 'brc-20',
        op: 'mint',
        tick: 'PEPE',
        amt: 2,
      });
      expect(brc20FromInscription(insert2)).toBeUndefined();
      const insert3 = testInsert({
        p: 'brc-20',
        op: 'transfer',
        tick: 'PEPE',
        amt: 2,
      });
      expect(brc20FromInscription(insert3)).toBeUndefined();
    });

    test('ignores empty strings', () => {
      const insert1 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: '',
        max: '21000000',
      });
      expect(brc20FromInscription(insert1)).toBeUndefined();
      const insert1a = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '',
      });
      expect(brc20FromInscription(insert1a)).toBeUndefined();
      const insert1b = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '',
      });
      expect(brc20FromInscription(insert1b)).toBeUndefined();
      const insert1c = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '200',
        dec: '',
      });
      expect(brc20FromInscription(insert1c)).toBeUndefined();
      const insert2 = testInsert({
        p: 'brc-20',
        op: 'mint',
        tick: '',
      });
      expect(brc20FromInscription(insert2)).toBeUndefined();
      const insert2a = testInsert({
        p: 'brc-20',
        op: 'mint',
        tick: 'PEPE',
        amt: '',
      });
      expect(brc20FromInscription(insert2a)).toBeUndefined();
      const insert3 = testInsert({
        p: 'brc-20',
        op: 'transfer',
        tick: '',
      });
      expect(brc20FromInscription(insert3)).toBeUndefined();
      const insert3a = testInsert({
        p: 'brc-20',
        op: 'transfer',
        tick: 'PEPE',
        amt: '',
      });
      expect(brc20FromInscription(insert3a)).toBeUndefined();
    });

    test('numeric strings must not be zero', () => {
      const insert1 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '0',
      });
      expect(brc20FromInscription(insert1)).toBeUndefined();
      const insert1b = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '0.0',
      });
      expect(brc20FromInscription(insert1b)).toBeUndefined();
      const insert1c = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '200',
        dec: '0',
      });
      // `dec` can have a value of 0
      expect(brc20FromInscription(insert1c)).not.toBeUndefined();
      const insert2a = testInsert({
        p: 'brc-20',
        op: 'mint',
        tick: 'PEPE',
        amt: '0',
      });
      expect(brc20FromInscription(insert2a)).toBeUndefined();
      const insert3a = testInsert({
        p: 'brc-20',
        op: 'transfer',
        tick: 'PEPE',
        amt: '.0000',
      });
      expect(brc20FromInscription(insert3a)).toBeUndefined();
    });

    test('numeric fields are not stripped/trimmed', () => {
      const insert1 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: ' 200  ',
      });
      expect(brc20FromInscription(insert1)).toBeUndefined();
      const insert1b = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '+10000',
      });
      expect(brc20FromInscription(insert1b)).toBeUndefined();
      const insert1c = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '200',
        dec: '   0 ',
      });
      expect(brc20FromInscription(insert1c)).toBeUndefined();
      const insert2a = testInsert({
        p: 'brc-20',
        op: 'mint',
        tick: 'PEPE',
        amt: '.05 ',
      });
      expect(brc20FromInscription(insert2a)).toBeUndefined();
      const insert3a = testInsert({
        p: 'brc-20',
        op: 'transfer',
        tick: 'PEPE',
        amt: '-25.00',
      });
      expect(brc20FromInscription(insert3a)).toBeUndefined();
    });

    test('max value of dec is 18', () => {
      const insert1c = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '200',
        dec: '20',
      });
      expect(brc20FromInscription(insert1c)).toBeUndefined();
    });

    test('max value of any numeric field is uint64_max', () => {
      const insert1 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '18446744073709551999',
      });
      expect(brc20FromInscription(insert1)).toBeUndefined();
      const insert1b = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
        lim: '18446744073709551999',
      });
      expect(brc20FromInscription(insert1b)).toBeUndefined();
      const insert2a = testInsert({
        p: 'brc-20',
        op: 'mint',
        tick: 'PEPE',
        amt: '18446744073709551999',
      });
      expect(brc20FromInscription(insert2a)).toBeUndefined();
      const insert3a = testInsert({
        p: 'brc-20',
        op: 'transfer',
        tick: 'PEPE',
        amt: '18446744073709551999',
      });
      expect(brc20FromInscription(insert3a)).toBeUndefined();
    });

    test('valid JSONs can have additional properties', () => {
      const insert1 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '200',
        foo: 'bar',
        test: 1,
      });
      expect(brc20FromInscription(insert1)).not.toBeUndefined();
      const insert2a = testInsert({
        p: 'brc-20',
        op: 'mint',
        tick: 'PEPE',
        amt: '5',
        foo: 'bar',
        test: 1,
      });
      expect(brc20FromInscription(insert2a)).not.toBeUndefined();
      const insert3a = testInsert({
        p: 'brc-20',
        op: 'transfer',
        tick: 'PEPE',
        amt: '25',
        foo: 'bar',
        test: 1,
      });
      expect(brc20FromInscription(insert3a)).not.toBeUndefined();
    });
  });

  describe('deploy', () => {
    test('deploy is saved', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '21000000',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            })
          )
          .build()
      );
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=PEPE`,
      });
      expect(response1.statusCode).toBe(200);
      const responseJson1 = response1.json();
      expect(responseJson1.total).toBe(1);
      expect(responseJson1.results).toStrictEqual([
        {
          address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          block_height: 775617,
          decimals: 18,
          id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          number: 5,
          mint_limit: null,
          max_supply: '21000000',
          ticker: 'PEPE',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        },
      ]);
    });

    test('ignores deploys for existing token', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '21000000',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '000000000000000000021a0207fa97024506baaa74396822fb0a07ac20e70148',
          })
          .transaction({
            hash: '3f8067a6e9b45308b5a090c2987feeb2d08cbaf814ef2ffabad7c381b62f5f7e',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '19000000',
              },
              number: 6,
              tx_id: '3f8067a6e9b45308b5a090c2987feeb2d08cbaf814ef2ffabad7c381b62f5f7e',
              address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            })
          )
          .build()
      );
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=PEPE`,
      });
      expect(response1.statusCode).toBe(200);
      const responseJson1 = response1.json();
      expect(responseJson1.total).toBe(1);
      expect(responseJson1.results).toStrictEqual([
        {
          address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          block_height: 775617,
          decimals: 18,
          id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          max_supply: '21000000',
          mint_limit: null,
          number: 5,
          ticker: 'PEPE',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        },
      ]);
    });

    test('ignores case insensitive deploy for existing token', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '21000000',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '000000000000000000021a0207fa97024506baaa74396822fb0a07ac20e70148',
          })
          .transaction({
            hash: '3f8067a6e9b45308b5a090c2987feeb2d08cbaf814ef2ffabad7c381b62f5f7e',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'pepe',
                max: '19000000',
              },
              number: 6,
              tx_id: '3f8067a6e9b45308b5a090c2987feeb2d08cbaf814ef2ffabad7c381b62f5f7e',
              address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            })
          )
          .build()
      );
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=PEPE`,
      });
      expect(response1.statusCode).toBe(200);
      const responseJson1 = response1.json();
      expect(responseJson1.total).toBe(1);
      expect(responseJson1.results).toStrictEqual([
        {
          address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          block_height: 775617,
          decimals: 18,
          id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          max_supply: '21000000',
          mint_limit: null,
          number: 5,
          ticker: 'PEPE',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        },
      ]);
      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=pepe`, // Lowercase
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(1);
      expect(responseJson2.results).toStrictEqual([
        {
          address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          block_height: 775617,
          decimals: 18,
          id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          max_supply: '21000000',
          mint_limit: null,
          number: 5,
          ticker: 'PEPE',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
        },
      ]);
    });
  });

  describe('mint', () => {
    test('valid mints are saved and balance reflected', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '21000000',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '250000',
              },
              number: 6,
              tx_id: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
              address: address,
            })
          )
          .build()
      );

      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response1.statusCode).toBe(200);
      const responseJson1 = response1.json();
      expect(responseJson1.total).toBe(1);
      expect(responseJson1.results).toStrictEqual([
        {
          ticker: 'PEPE',
          available_balance: '250000',
          overall_balance: '250000',
          transferrable_balance: '0',
        },
      ]);

      // New mint
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775619,
            hash: '0000000000000000000077163227125e51d838787d6af031bc9b55a3a1cc1b2c',
          })
          .transaction({
            hash: '7a1adbc3e93ddf8d7c4e0ba75aa11c98c431521dd850be8b955feedb716d8bec',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'pepe',
                amt: '100000',
              },
              number: 7,
              tx_id: '7a1adbc3e93ddf8d7c4e0ba75aa11c98c431521dd850be8b955feedb716d8bec',
              address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            })
          )
          .build()
      );

      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(1);
      expect(responseJson2.results).toStrictEqual([
        {
          ticker: 'PEPE',
          available_balance: '350000',
          overall_balance: '350000',
          transferrable_balance: '0',
        },
      ]);
    });

    test('rollback mints deduct balance correctly', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '21000000',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '250000',
              },
              number: 6,
              tx_id: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
              address: address,
            })
          )
          .build()
      );
      // Rollback
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .rollback()
          .block({
            height: 775619,
            hash: '0000000000000000000077163227125e51d838787d6af031bc9b55a3a1cc1b2c',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '250000',
              },
              number: 6,
              tx_id: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
              address: address,
            })
          )
          .build()
      );

      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(0);
      expect(responseJson2.results).toStrictEqual([]);
    });

    test('numbers should not have more decimal digits than "dec" of ticker', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '21000000',
                dec: '1',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '250000.000', // Invalid decimal count
              },
              number: 6,
              tx_id: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
              address: address,
            })
          )
          .build()
      );

      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(0);
      expect(responseJson2.results).toStrictEqual([]);
    });

    test('mint exceeds token supply', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '2500',
                dec: '1',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '1000',
              },
              number: 6,
              tx_id: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
              address: address,
            })
          )
          .transaction({
            hash: '7e09bda2cba34bca648cca6d79a074940d39b6137150d3a3edcf80c0e01419a5',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '1000',
              },
              number: 6,
              tx_id: '7e09bda2cba34bca648cca6d79a074940d39b6137150d3a3edcf80c0e01419a5',
              address: address,
            })
          )
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '250000', // Exceeds supply
              },
              number: 8,
              tx_id: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
              address: address,
            })
          )
          .build()
      );

      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(1);
      expect(responseJson2.results).toStrictEqual([
        {
          available_balance: '2500', // Max capacity
          overall_balance: '2500',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);

      // No more mints allowed
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775619,
            hash: '000000000000000000001f14513d722146fddab04a1855665a5eca22df288c3c',
          })
          .transaction({
            hash: 'bf7a3e1a0647ca88f6539119b2defaec302683704ea270b3302e709597643548',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '1000',
              },
              number: 9,
              tx_id: 'bf7a3e1a0647ca88f6539119b2defaec302683704ea270b3302e709597643548',
              address: address,
            })
          )
          .build()
      );

      const response3 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response3.statusCode).toBe(200);
      const responseJson3 = response3.json();
      expect(responseJson3).toStrictEqual(responseJson2);
    });

    test('ignores mint for non-existent token', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '1000',
              },
              number: 6,
              tx_id: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
              address: address,
            })
          )
          .build()
      );

      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(0);
      expect(responseJson2.results).toStrictEqual([]);
    });

    test('mint exceeds token mint limit', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '2500',
                dec: '1',
                lim: '100',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '1000', // Greater than limit
              },
              number: 6,
              tx_id: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
              address: address,
            })
          )
          .build()
      );

      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(0);
      expect(responseJson2.results).toStrictEqual([]);
    });
  });

  describe('transfer', () => {
    const deployAndMintPEPE = async (address: string) => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775617,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'deploy',
                tick: 'PEPE',
                max: '250000',
              },
              number: 5,
              tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775618,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'mint',
                tick: 'PEPE',
                amt: '10000',
              },
              number: 6,
              tx_id: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
              address: address,
            })
          )
          .build()
      );
    };

    test('available balance decreases on transfer inscription', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await deployAndMintPEPE(address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775619,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '2000',
              },
              number: 7,
              tx_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
              address: address,
            })
          )
          .build()
      );

      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.results).toStrictEqual([
        {
          available_balance: '8000',
          overall_balance: '10000',
          ticker: 'PEPE',
          transferrable_balance: '2000',
        },
      ]);
    });

    test('cannot transfer more than available balance', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await deployAndMintPEPE(address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775619,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '20000', // More than was minted
              },
              number: 7,
              tx_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
              address: address,
            })
          )
          .build()
      );

      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.results).toStrictEqual([
        {
          available_balance: '10000',
          overall_balance: '10000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);
    });

    test('multiple transfers in block', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await deployAndMintPEPE(address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775619,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '9000',
              },
              number: 7,
              tx_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
              address: address,
            })
          )
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '2000', // Will exceed available balance
              },
              number: 8,
              tx_id: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
              address: address,
            })
          )
          .build()
      );

      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.results).toStrictEqual([
        {
          available_balance: '1000',
          overall_balance: '10000',
          ticker: 'PEPE',
          transferrable_balance: '9000',
        },
      ]);
    });

    test('send balance to address', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      const address2 = '3QNjwPDRafjBm9XxJpshgk3ksMJh3TFxTU';
      await deployAndMintPEPE(address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775619,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '9000',
              },
              number: 7,
              tx_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775620,
            hash: '00000000000000000003feae13d107f0f2c4fb4dd08fb2a8b1ab553512e77f03',
          })
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .inscriptionTransferred({
            inscription_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
            updated_address: address2,
            satpoint_pre_transfer:
              'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a:0:0',
            satpoint_post_transfer:
              '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac:0:0',
            post_transfer_output_value: null,
            tx_index: 0,
          })
          .build()
      );

      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response1.statusCode).toBe(200);
      const json1 = response1.json();
      expect(json1.total).toBe(1);
      expect(json1.results).toStrictEqual([
        {
          available_balance: '1000',
          overall_balance: '1000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);

      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      expect(response2.statusCode).toBe(200);
      const json2 = response2.json();
      expect(json2.total).toBe(1);
      expect(json2.results).toStrictEqual([
        {
          available_balance: '9000',
          overall_balance: '9000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);
    });

    test('cannot spend valid transfer twice', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      const address2 = '3QNjwPDRafjBm9XxJpshgk3ksMJh3TFxTU';
      await deployAndMintPEPE(address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775619,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '9000',
              },
              number: 7,
              tx_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775620,
            hash: '000000000000000000016ddf56d0fe72476165acee9500d48d3e2aaf8412f489',
          })
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .inscriptionTransferred({
            inscription_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
            updated_address: address2,
            satpoint_pre_transfer:
              'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a:0:0',
            satpoint_post_transfer:
              '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac:0:0',
            post_transfer_output_value: null,
            tx_index: 0,
          })
          .build()
      );
      // Attempt to transfer the same inscription back to the original address to change its
      // balance.
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775621,
            hash: '00000000000000000003feae13d107f0f2c4fb4dd08fb2a8b1ab553512e77f03',
          })
          .transaction({
            hash: '55bec906eadc9f5c120cc39555ba46e85e562eacd6217e4dd0b8552783286d0e',
          })
          .inscriptionTransferred({
            inscription_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
            updated_address: address,
            satpoint_pre_transfer:
              '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac:0:0',
            satpoint_post_transfer:
              '55bec906eadc9f5c120cc39555ba46e85e562eacd6217e4dd0b8552783286d0e:0:0',
            post_transfer_output_value: null,
            tx_index: 0,
          })
          .build()
      );

      // Balances only reflect the first transfer.
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response1.statusCode).toBe(200);
      const json1 = response1.json();
      expect(json1.total).toBe(1);
      expect(json1.results).toStrictEqual([
        {
          available_balance: '1000',
          overall_balance: '1000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);

      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      expect(response2.statusCode).toBe(200);
      const json2 = response2.json();
      expect(json2.total).toBe(1);
      expect(json2.results).toStrictEqual([
        {
          available_balance: '9000',
          overall_balance: '9000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);
    });

    test('balance transfer gap fill applied correctly', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      const address2 = '3QNjwPDRafjBm9XxJpshgk3ksMJh3TFxTU';
      await deployAndMintPEPE(address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775640,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '9000',
              },
              number: 7,
              tx_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
              address: address,
            })
          )
          .build()
      );

      // Make the first seen transfer
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775651,
            hash: '00000000000000000003feae13d107f0f2c4fb4dd08fb2a8b1ab553512e77f03',
          })
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .inscriptionTransferred({
            inscription_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
            updated_address: address2,
            satpoint_pre_transfer:
              'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a:0:0',
            satpoint_post_transfer:
              '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac:0:0',
            post_transfer_output_value: null,
            tx_index: 0,
          })
          .build()
      );
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response1.statusCode).toBe(200);
      const json1 = response1.json();
      expect(json1.total).toBe(1);
      expect(json1.results).toStrictEqual([
        {
          available_balance: '1000',
          overall_balance: '1000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);
      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      expect(response2.statusCode).toBe(200);
      const json2 = response2.json();
      expect(json2.total).toBe(1);
      expect(json2.results).toStrictEqual([
        {
          available_balance: '9000',
          overall_balance: '9000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);

      // Oops, turns out there was a gap fill with another transfer first
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 775645,
            hash: '00000000000000000003feae13d107f0f2c4fb4dd08fb2a8b1ab553512e77f03',
          })
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .inscriptionTransferred({
            inscription_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
            updated_address: 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz',
            satpoint_pre_transfer:
              'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a:0:0',
            satpoint_post_transfer:
              '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac:0:0',
            post_transfer_output_value: null,
            tx_index: 0,
          })
          .build()
      );
      const response1b = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      expect(response1b.statusCode).toBe(200);
      const json1b = response1b.json();
      expect(json1b.total).toBe(1);
      expect(json1b.results).toStrictEqual([
        {
          available_balance: '1000',
          overall_balance: '1000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);
      const response2b = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      expect(response2b.statusCode).toBe(200);
      const json2b = response2b.json();
      expect(json2b.total).toBe(1);
      expect(json2b.results).toStrictEqual([
        {
          available_balance: '0',
          overall_balance: '0',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);
      // This address is the one that should have the balance.
      const response3 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      expect(response3.statusCode).toBe(200);
      const json3 = response3.json();
      expect(json3.total).toBe(1);
      expect(json3.results).toStrictEqual([
        {
          available_balance: '9000',
          overall_balance: '9000',
          ticker: 'PEPE',
          transferrable_balance: '0',
        },
      ]);
    });
  });
});

import { cycleMigrations } from '@hirosystems/api-toolkit';
import { buildApiServer } from '../src/api/init';
import { Brc20ActivityResponse, Brc20TokenResponse } from '../src/api/schemas';
import { brc20FromInscription } from '../src/pg/brc20/helpers';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { DbInscriptionInsert } from '../src/pg/types';
import {
  TestChainhookPayloadBuilder,
  TestFastifyServer,
  brc20Reveal,
  incrementing,
  randomHash,
  rollBack,
} from './helpers';

describe('BRC-20', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

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
        recursive: false,
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
        recursive: false,
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
        recursive: false,
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
      const insert4 = testInsert({
        p: 'brc-20',
        op: 'deploy',
        tick: 'X', // less than 4 bytes
        max: '21000000',
      });
      expect(brc20FromInscription(insert4)).toBeUndefined();
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
            timestamp: 1677811111,
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
          max_supply: '21000000.000000000000000000',
          ticker: 'PEPE',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          deploy_timestamp: 1677811111000,
          minted_supply: '0.000000000000000000',
          tx_count: 1,
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
          max_supply: '21000000.000000000000000000',
          mint_limit: null,
          number: 5,
          ticker: 'PEPE',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          deploy_timestamp: 1677803510000,
          minted_supply: '0.000000000000000000',
          tx_count: 1,
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
          max_supply: '21000000.000000000000000000',
          mint_limit: null,
          number: 5,
          ticker: 'PEPE',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          deploy_timestamp: 1677803510000,
          minted_supply: '0.000000000000000000',
          tx_count: 1,
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
          max_supply: '21000000.000000000000000000',
          mint_limit: null,
          number: 5,
          ticker: 'PEPE',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          deploy_timestamp: 1677803510000,
          minted_supply: '0.000000000000000000',
          tx_count: 1,
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
          available_balance: '250000.000000000000000000',
          overall_balance: '250000.000000000000000000',
          transferrable_balance: '0.000000000000000000',
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
          available_balance: '350000.000000000000000000',
          overall_balance: '350000.000000000000000000',
          transferrable_balance: '0.000000000000000000',
        },
      ]);

      const response3 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=PEPE`,
      });
      expect(response3.statusCode).toBe(200);
      const responseJson3 = response3.json();
      expect(responseJson3.total).toBe(1);
      expect(responseJson3.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ticker: 'PEPE', minted_supply: '350000.000000000000000000' }),
        ])
      );
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

      const response3 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/PEPE`,
      });
      expect(response3.json().token.minted_supply).toBe('0.000000000000000000');
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
              number: 7,
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
                amt: '5000000000', // Exceeds supply
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
        url: `/ordinals/brc-20/balances/${address}?ticker=PEPE`,
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(1);
      expect(responseJson2.results).toStrictEqual([
        {
          available_balance: '2500.0', // Max capacity
          overall_balance: '2500.0',
          ticker: 'PEPE',
          transferrable_balance: '0.0',
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
          available_balance: '8000.000000000000000000',
          overall_balance: '10000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '2000.000000000000000000',
        },
      ]);

      // Balance at previous block
      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}?block_height=775618`,
      });
      const json2 = response2.json();
      expect(json2.results[0].available_balance).toBe('10000.000000000000000000');
    });

    test('transfer ignored if token not found', async () => {
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
                tick: 'TEST', // Not found
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
          available_balance: '10000.000000000000000000',
          overall_balance: '10000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
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
                amt: '5000000000', // More than was minted
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
          available_balance: '10000.000000000000000000',
          overall_balance: '10000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
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
          available_balance: '1000.000000000000000000',
          overall_balance: '10000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '9000.000000000000000000',
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
          available_balance: '1000.000000000000000000',
          overall_balance: '1000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
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
          available_balance: '9000.000000000000000000',
          overall_balance: '9000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
        },
      ]);

      // Balance at previous block
      const prevBlock1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}?block_height=775618`,
      });
      const prevBlockJson1 = prevBlock1.json();
      expect(prevBlockJson1.results[0].available_balance).toBe('10000.000000000000000000');
      const prevBlock2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}?block_height=775618`,
      });
      const prevBlockJson2 = prevBlock2.json();
      expect(prevBlockJson2.results[0]).toBeUndefined();
    });

    test('sending transfer as fee returns amount to sender', async () => {
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
            updated_address: '', // Sent as fee
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
          available_balance: '10000.000000000000000000',
          overall_balance: '10000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
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
          available_balance: '1000.000000000000000000',
          overall_balance: '1000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
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
          available_balance: '9000.000000000000000000',
          overall_balance: '9000.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
        },
      ]);
    });

    test('explicit transfer to self restores balance correctly', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await deployAndMintPEPE(address);
      const address2 = 'bc1ph8dp3lqhzpjphqcc3ucgsm7k3w4d74uwfpv8sv893kn3kpkqrdxqqy3cv6';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 789340,
            hash: '000000000000000000024643a7b110145e6f4ce9a5b18ef53d4ffa282fe3d978',
          })
          .transaction({
            hash: '825a25b64b5d99ca30e04e53cc9a3020412e1054eb2a7523eb075ddd6d983205',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '20',
              },
              number: 10,
              tx_id: '825a25b64b5d99ca30e04e53cc9a3020412e1054eb2a7523eb075ddd6d983205',
              address: address,
            })
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 789344,
            hash: '000000000000000000028e52aab1a0235f624033283d0a6dd8bbb067057c5c77',
          })
          .transaction({
            hash: '486815e61723d03af344e1256d7e0c028a8e9e71eb38157f4bf069eb94292ee1',
          })
          .inscriptionTransferred({
            inscription_id: '825a25b64b5d99ca30e04e53cc9a3020412e1054eb2a7523eb075ddd6d983205i0',
            updated_address: address2,
            satpoint_pre_transfer:
              '825a25b64b5d99ca30e04e53cc9a3020412e1054eb2a7523eb075ddd6d983205:0:0',
            satpoint_post_transfer:
              '486815e61723d03af344e1256d7e0c028a8e9e71eb38157f4bf069eb94292ee1:0:0',
            post_transfer_output_value: null,
            tx_index: 0,
          })
          .build()
      );
      let response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      expect(response.json().results).toStrictEqual([
        {
          available_balance: '20.000000000000000000',
          overall_balance: '20.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
        },
      ]);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 789479,
            hash: '00000000000000000003ccc653ffeb39b50e9e04b2f0b3702783c7639d8822ab',
          })
          .transaction({
            hash: '09a812f72275892b4858880cf3821004a6e8885817159b340639afe9952ac053',
          })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'PEPE',
                amt: '20',
              },
              number: 11,
              tx_id: '09a812f72275892b4858880cf3821004a6e8885817159b340639afe9952ac053',
              address: address2,
            })
          )
          .build()
      );
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      expect(response.json().results).toStrictEqual([
        {
          available_balance: '0.000000000000000000',
          overall_balance: '20.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '20.000000000000000000',
        },
      ]);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: 791469,
            hash: '000000000000000000003bb9b40f84c2f1e13219fe6298c288883df17d76f361',
          })
          .transaction({
            hash: '26c0c3acbb1c87e682ade86220ba06e649d7599ecfc49a71495f1bdd04efbbb4',
          })
          .inscriptionTransferred({
            inscription_id: '09a812f72275892b4858880cf3821004a6e8885817159b340639afe9952ac053i0',
            updated_address: address2,
            satpoint_pre_transfer:
              '486815e61723d03af344e1256d7e0c028a8e9e71eb38157f4bf069eb94292ee1:0:0',
            satpoint_post_transfer:
              '26c0c3acbb1c87e682ade86220ba06e649d7599ecfc49a71495f1bdd04efbbb4:0:0',
            post_transfer_output_value: null,
            tx_index: 0,
          })
          .build()
      );
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      expect(response.json().results).toStrictEqual([
        {
          available_balance: '20.000000000000000000',
          overall_balance: '20.000000000000000000',
          ticker: 'PEPE',
          transferrable_balance: '0.000000000000000000',
        },
      ]);
    });
  });

  describe('routes', () => {
    describe('/brc-20/tokens', () => {
      test('tokens endpoint', async () => {
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 775617 })
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
        const response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens/PEPE`,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toStrictEqual({
          token: {
            id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
            number: 5,
            block_height: 775617,
            tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
            address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            ticker: 'PEPE',
            max_supply: '21000000.000000000000000000',
            mint_limit: null,
            decimals: 18,
            deploy_timestamp: 1677803510000,
            minted_supply: '0.000000000000000000',
            tx_count: 1,
          },
          supply: {
            max_supply: '21000000.000000000000000000',
            minted_supply: '0.000000000000000000',
            holders: 0,
          },
        });
      });

      test('tokens filter by ticker prefix', async () => {
        const inscriptionNumbers = incrementing(1);
        const blockHeights = incrementing(775600);

        let transferHash = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHash })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'PEPE',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: transferHash,
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
              })
            )
            .build()
        );

        transferHash = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHash })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'PEER',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: transferHash,
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
              })
            )
            .build()
        );

        transferHash = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHash })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'ABCD',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: transferHash,
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
              })
            )
            .build()
        );

        transferHash = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHash })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'DCBA',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: transferHash,
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
              })
            )
            .build()
        );
        const response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens?ticker=PE&ticker=AB`,
        });
        expect(response.statusCode).toBe(200);
        const responseJson = response.json();
        expect(responseJson.total).toBe(3);
        expect(responseJson.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ ticker: 'PEPE' }),
            expect.objectContaining({ ticker: 'PEER' }),
            expect.objectContaining({ ticker: 'ABCD' }),
          ])
        );
      });

      test('tokens using order_by tx_count', async () => {
        // Setup
        const inscriptionNumbers = incrementing(1);
        const blockHeights = incrementing(775600);
        const addressA = 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz';
        const addressB = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

        // A deploys PEPE
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'PEPE',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressA,
              })
            )
            .build()
        );

        // A mints 10000 PEPE 10 times (will later be rolled back)
        const pepeMints = [];
        for (let i = 0; i < 10; i++) {
          const txHash = randomHash();
          const payload = new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: txHash })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'mint',
                  tick: 'PEPE',
                  amt: '10000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: txHash,
                address: addressA,
              })
            )
            .build();
          pepeMints.push(payload);
          await db.updateInscriptions(payload);
        }

        // B deploys ABCD
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'ABCD',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressB,
              })
            )
            .build()
        );

        // B mints 10000 ABCD
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'mint',
                  tick: 'ABCD',
                  amt: '10000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressB,
              })
            )
            .build()
        );

        // B send 1000 ABCD to A
        // (create inscription, transfer)
        const txHashTransfer = randomHash();
        const payloadTransfer = new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: txHashTransfer })
          .inscriptionRevealed(
            brc20Reveal({
              json: {
                p: 'brc-20',
                op: 'transfer',
                tick: 'ABCD',
                amt: '1000',
              },
              number: inscriptionNumbers.next().value,
              tx_id: txHashTransfer,
              address: addressB,
            })
          )
          .build();
        await db.updateInscriptions(payloadTransfer);
        // (send inscription, transfer_send)
        const txHashTransferSend = randomHash();
        const payloadTransferSend = new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: txHashTransferSend })
          .inscriptionTransferred({
            inscription_id: `${txHashTransfer}i0`,
            updated_address: addressA,
            satpoint_pre_transfer: `${txHashTransfer}:0:0`,
            satpoint_post_transfer: `${txHashTransferSend}:0:0`,
            post_transfer_output_value: null,
            tx_index: 0,
          })
          .build();
        await db.updateInscriptions(payloadTransferSend);

        let response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens`,
        });
        expect(response.statusCode).toBe(200);
        let json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toHaveLength(2);

        // WITHOUT tx_count sort:
        expect(json.results).toEqual([
          // The first result is the token with the latest activity (ABCD)
          expect.objectContaining({
            ticker: 'ABCD',
            tx_count: 4,
          } as Brc20TokenResponse),
          expect.objectContaining({
            ticker: 'PEPE',
            tx_count: 11,
          } as Brc20TokenResponse),
        ]);

        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens?order_by=tx_count`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toHaveLength(2);

        // WITH tx_count sort: The first result is the most active token (PEPE)
        expect(json.results).toEqual([
          expect.objectContaining({
            ticker: 'PEPE',
            tx_count: 11,
          } as Brc20TokenResponse),
          expect.objectContaining({
            ticker: 'ABCD',
            tx_count: 4,
          } as Brc20TokenResponse),
        ]);

        // Rollback PEPE mints
        for (const payload of pepeMints) {
          const payloadRollback = { ...payload, apply: [], rollback: payload.apply };
          await db.updateInscriptions(payloadRollback);
        }

        // WITH tx_count sort: The first result is the most active token (now ABCD)
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens?order_by=tx_count`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toHaveLength(2);
        expect(json.results).toEqual([
          expect.objectContaining({
            ticker: 'ABCD',
            tx_count: 4,
          } as Brc20TokenResponse),
          expect.objectContaining({
            ticker: 'PEPE',
            tx_count: 1, // only the deploy remains
          } as Brc20TokenResponse),
        ]);

        // Rollback ABCD transfer
        await db.updateInscriptions({
          ...payloadTransferSend,
          apply: [],
          rollback: payloadTransferSend.apply,
        });
        await db.updateInscriptions({
          ...payloadTransfer,
          apply: [],
          rollback: payloadTransfer.apply,
        });

        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens?order_by=tx_count`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toHaveLength(2);
        expect(json.results).toEqual([
          expect.objectContaining({
            ticker: 'ABCD',
            tx_count: 2, // only the deploy and mint remain
          } as Brc20TokenResponse),
          expect.objectContaining({
            ticker: 'PEPE',
            tx_count: 1,
          } as Brc20TokenResponse),
        ]);
      });
    });

    describe('/brc-20/activity', () => {
      test('activity for token transfers', async () => {
        // Setup
        const inscriptionNumbers = incrementing(1);
        const blockHeights = incrementing(775600);
        const addressA = 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz';
        const addressB = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

        // A deploys PEPE
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'PEPE',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressA,
              })
            )
            .build()
        );

        // Verify that the PEPE deploy is in the activity feed
        let response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        let json = response.json();
        expect(json.total).toBe(1);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'deploy',
              ticker: 'PEPE',
              address: addressA,
              deploy: expect.objectContaining({
                max_supply: '21000000.000000000000000000',
              }),
            } as Brc20ActivityResponse),
          ])
        );

        // A mints 10000 PEPE
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'mint',
                  tick: 'PEPE',
                  amt: '10000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressA,
              })
            )
            .build()
        );

        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'deploy',
              ticker: 'PEPE',
            } as Brc20ActivityResponse),
            expect.objectContaining({
              operation: 'mint',
              ticker: 'PEPE',
              address: addressA,
              mint: {
                amount: '10000.000000000000000000',
              },
            } as Brc20ActivityResponse),
          ])
        );

        // B mints 10000 PEPE
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'mint',
                  tick: 'PEPE',
                  amt: '10000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressB,
              })
            )
            .build()
        );

        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(3);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'mint',
              ticker: 'PEPE',
              address: addressB,
              mint: {
                amount: '10000.000000000000000000',
              },
            } as Brc20ActivityResponse),
          ])
        );

        // A creates transfer of 9000 PEPE
        const transferHash = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHash })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'transfer',
                  tick: 'PEPE',
                  amt: '9000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: transferHash,
                address: addressA,
              })
            )
            .build()
        );

        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(4);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer',
              ticker: 'PEPE',
              address: addressA,
              tx_id: transferHash,
              transfer: {
                amount: '9000.000000000000000000',
                from_address: addressA,
              },
            } as Brc20ActivityResponse),
          ])
        );

        // A sends transfer inscription to B (aka transfer/sale)
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionTransferred({
              updated_address: addressB,
              tx_index: 0,
              inscription_id: `${transferHash}i0`,
              post_transfer_output_value: null,
              satpoint_pre_transfer: `${transferHash}:0:0`,
              satpoint_post_transfer:
                '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac:0:0',
            })
            .build()
        );

        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(5);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer_send',
              ticker: 'PEPE',
              tx_id: expect.not.stringMatching(transferHash),
              address: addressB,
              transfer_send: {
                amount: '9000.000000000000000000',
                from_address: addressA,
                to_address: addressB,
              },
            } as Brc20ActivityResponse),
          ])
        );

        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE&operation=transfer_send`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(1);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer_send',
              ticker: 'PEPE',
              tx_id: expect.not.stringMatching(transferHash),
              address: addressB,
              transfer_send: {
                amount: '9000.000000000000000000',
                from_address: addressA,
                to_address: addressB,
              },
            } as Brc20ActivityResponse),
          ])
        );
      });

      test('activity for multiple token transfers among three participants', async () => {
        // Step 1: A deploys a token
        // Step 2: A mints 1000 of the token
        // Step 3: B mints 2000 of the token
        // Step 4: A creates a transfer to B
        // Step 5: B creates a transfer to C
        // Step 6: A transfer_send the transfer to B
        // Step 7: B transfer_send the transfer to C

        // Setup
        const inscriptionNumbers = incrementing(1);
        const blockHeights = incrementing(775600);
        const addressA = 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz';
        const addressB = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
        const addressC = 'bc1q9d80h0q5d3f54w7w8c3l2sguf9uset4ydw9xj2';

        // Step 1: A deploys a token
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'PEPE',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressA,
              })
            )
            .build()
        );

        // Verify that the PEPE deploy is in the activity feed
        let response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        let json = response.json();
        expect(json.total).toBe(1);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'deploy',
              ticker: 'PEPE',
              address: addressA,
              deploy: expect.objectContaining({
                max_supply: '21000000.000000000000000000',
              }),
            } as Brc20ActivityResponse),
          ])
        );

        // Step 2: A mints 1000 of the token
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'mint',
                  tick: 'PEPE',
                  amt: '1000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressA,
              })
            )
            .build()
        );

        // Verify that the PEPE mint is in the activity feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'mint',
              ticker: 'PEPE',
              address: addressA,
              mint: {
                amount: '1000.000000000000000000',
              },
            } as Brc20ActivityResponse),
          ])
        );
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE&address=${addressA}`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'deploy',
              ticker: 'PEPE',
              address: addressA,
              deploy: expect.objectContaining({
                max_supply: '21000000.000000000000000000',
              }),
            } as Brc20ActivityResponse),
            expect.objectContaining({
              operation: 'mint',
              ticker: 'PEPE',
              address: addressA,
              mint: {
                amount: '1000.000000000000000000',
              },
            } as Brc20ActivityResponse),
          ])
        );

        // Step 3: B mints 2000 of the token
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'mint',
                  tick: 'PEPE',
                  amt: '2000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressB,
              })
            )
            .build()
        );

        // Verify that the PEPE mint is in the activity feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(3);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'mint',
              ticker: 'PEPE',
              address: addressB,
              mint: {
                amount: '2000.000000000000000000',
              },
            } as Brc20ActivityResponse),
          ])
        );

        // Step 4: A creates a transfer to B
        const transferHashAB = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHashAB })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'transfer',
                  tick: 'PEPE',
                  amt: '1000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: transferHashAB,
                address: addressA,
              })
            )
            .build()
        );

        // Verify that the PEPE transfer is in the activity feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(4);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer',
              ticker: 'PEPE',
              address: addressA,
              tx_id: transferHashAB,
              transfer: {
                amount: '1000.000000000000000000',
                from_address: addressA,
              },
            } as Brc20ActivityResponse),
          ])
        );
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE&address=${addressA}`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(3);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer',
              ticker: 'PEPE',
              address: addressA,
              tx_id: transferHashAB,
              transfer: {
                amount: '1000.000000000000000000',
                from_address: addressA,
              },
            } as Brc20ActivityResponse),
          ])
        );

        // Step 5: B creates a transfer to C
        const transferHashBC = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHashBC })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'transfer',
                  tick: 'PEPE',
                  amt: '2000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: transferHashBC,
                address: addressB,
              })
            )
            .build()
        );

        // Verify that the PEPE transfer is in the activity feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(5);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer',
              ticker: 'PEPE',
              address: addressB,
              tx_id: transferHashBC,
              transfer: {
                amount: '2000.000000000000000000',
                from_address: addressB,
              },
            } as Brc20ActivityResponse),
          ])
        );

        // Step 6: A transfer_send the transfer to B
        const transferHashABSend = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHashABSend })
            .inscriptionTransferred({
              updated_address: addressB,
              tx_index: 0,
              inscription_id: `${transferHashAB}i0`,
              post_transfer_output_value: null,
              satpoint_pre_transfer: `${transferHashAB}:0:0`,
              satpoint_post_transfer: `${transferHashABSend}:0:0`,
            })
            .build()
        );
        // A gets the transfer send in its feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE&address=${addressA}`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(4);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer_send',
              ticker: 'PEPE',
              tx_id: expect.not.stringMatching(transferHashAB),
              address: addressB,
              transfer_send: {
                amount: '1000.000000000000000000',
                from_address: addressA,
                to_address: addressB,
              },
            } as Brc20ActivityResponse),
          ])
        );
        // B gets the transfer send in its feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE&address=${addressB}`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(3);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer_send',
              ticker: 'PEPE',
              tx_id: expect.not.stringMatching(transferHashAB),
              address: addressB,
              transfer_send: {
                amount: '1000.000000000000000000',
                from_address: addressA,
                to_address: addressB,
              },
            } as Brc20ActivityResponse),
          ])
        );

        // Verify that the PEPE transfer_send is in the activity feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(6);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer_send',
              ticker: 'PEPE',
              tx_id: expect.not.stringMatching(transferHashAB),
              address: addressB,
              transfer_send: {
                amount: '1000.000000000000000000',
                from_address: addressA,
                to_address: addressB,
              },
            } as Brc20ActivityResponse),
          ])
        );

        // Step 7: B transfer_send the transfer to C
        const transferHashBCSend = randomHash();
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: transferHashBCSend })
            .inscriptionTransferred({
              updated_address: addressC,
              tx_index: 0,
              inscription_id: `${transferHashBC}i0`,
              post_transfer_output_value: null,
              satpoint_pre_transfer: `${transferHashBC}:0:0`,
              satpoint_post_transfer: `${transferHashBCSend}:0:0`,
            })
            .build()
        );

        // Verify that the PEPE transfer_send is in the activity feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(7);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer_send',
              ticker: 'PEPE',
              tx_id: expect.not.stringMatching(transferHashBC),
              address: addressC,
              transfer_send: {
                amount: '2000.000000000000000000',
                from_address: addressB,
                to_address: addressC,
              },
            } as Brc20ActivityResponse),
          ])
        );
        // B gets the transfer send in its feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE&address=${addressB}`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(4);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer_send',
              ticker: 'PEPE',
              tx_id: expect.not.stringMatching(transferHashBC),
              address: addressC,
              transfer_send: {
                amount: '2000.000000000000000000',
                from_address: addressB,
                to_address: addressC,
              },
            } as Brc20ActivityResponse),
          ])
        );
        // C gets the transfer send in its feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEPE&address=${addressC}`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(1);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'transfer_send',
              ticker: 'PEPE',
              tx_id: expect.not.stringMatching(transferHashBC),
              address: addressC,
              transfer_send: {
                amount: '2000.000000000000000000',
                from_address: addressB,
                to_address: addressC,
              },
            } as Brc20ActivityResponse),
          ])
        );
      });

      test('activity for multiple token creation', async () => {
        const inscriptionNumbers = incrementing(1);
        const blockHeights = incrementing(775600);
        const addressA = 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz';

        // Step 1: Create a token PEPE
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'PEPE',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressA,
              })
            )
            .build()
        );

        // Verify that the PEPE deploy is in the activity feed
        let response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity`,
        });
        expect(response.statusCode).toBe(200);
        let json = response.json();
        expect(json.total).toBe(1);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'deploy',
              ticker: 'PEPE',
              address: addressA,
              deploy: expect.objectContaining({
                max_supply: '21000000.000000000000000000',
              }),
            } as Brc20ActivityResponse),
          ])
        );

        // Step 2: Create a token PEER
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: blockHeights.next().value })
            .transaction({ hash: randomHash() })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'deploy',
                  tick: 'PEER',
                  max: '21000000',
                },
                number: inscriptionNumbers.next().value,
                tx_id: randomHash(),
                address: addressA,
              })
            )
            .build()
        );

        // Verify that the PEER deploy is in the activity feed
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'deploy',
              ticker: 'PEER',
              address: addressA,
              deploy: expect.objectContaining({
                max_supply: '21000000.000000000000000000',
              }),
            } as Brc20ActivityResponse),
          ])
        );

        // Verify that no events are available before the first block height
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?ticker=PEER&block_height=${775600}`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(0);
        expect(json.results).toEqual([]);

        // Verify that the PEER deploy is not in the activity feed when using block_height parameter
        response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/activity?block_height=${775600}`,
        });
        expect(response.statusCode).toBe(200);
        json = response.json();
        expect(json.total).toBe(1);
        expect(json.results).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: 'deploy',
              ticker: 'PEPE',
              address: addressA,
              deploy: expect.objectContaining({
                max_supply: '21000000.000000000000000000',
              }),
            } as Brc20ActivityResponse),
          ])
        );
        // Should NOT include PEER at this block height
        expect(json.results).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ticker: 'PEER',
            } as Brc20ActivityResponse),
          ])
        );
      });
    });

    describe('/brc-20/token/holders', () => {
      test('displays holders for token', async () => {
        const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
        await deployAndMintPEPE(address);
        await db.updateInscriptions(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({
              height: 775619,
              hash: '0000000000000000000034dd2daec375371800da441b17651459b2220cbc1a6e',
            })
            .transaction({
              hash: '633648e0e1ddcab8dea0496a561f2b08c486ae619b5634d7bb55d7f0cd32ef16',
            })
            .inscriptionRevealed(
              brc20Reveal({
                json: {
                  p: 'brc-20',
                  op: 'mint',
                  tick: 'PEPE',
                  amt: '2000',
                },
                number: 999,
                tx_id: '633648e0e1ddcab8dea0496a561f2b08c486ae619b5634d7bb55d7f0cd32ef16',
                address: 'bc1qp9jgp9qtlhgvwjnxclj6kav6nr2fq09c206pyl',
              })
            )
            .build()
        );

        const response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens/PEPE/holders`,
        });
        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.total).toBe(2);
        expect(json.results).toStrictEqual([
          {
            address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            overall_balance: '10000.000000000000000000',
          },
          {
            address: 'bc1qp9jgp9qtlhgvwjnxclj6kav6nr2fq09c206pyl',
            overall_balance: '2000.000000000000000000',
          },
        ]);
      });

      test('shows empty list on token with no holders', async () => {
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
                address: 'bc1qp9jgp9qtlhgvwjnxclj6kav6nr2fq09c206pyl',
              })
            )
            .build()
        );
        const response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens/PEPE/holders`,
        });
        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.total).toBe(0);
        expect(json.results).toStrictEqual([]);
      });

      test('shows 404 on token not found', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: `/ordinals/brc-20/tokens/PEPE/holders`,
        });
        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe('rollbacks', () => {
    test('reflects rollbacks on balances and counts correctly', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      const address2 = '3QNjwPDRafjBm9XxJpshgk3ksMJh3TFxTU';
      await deployAndMintPEPE(address);

      // Transfer and send PEPE
      const transferPEPE = new TestChainhookPayloadBuilder()
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
        .build();
      await db.updateInscriptions(transferPEPE);
      const sendPEPE = new TestChainhookPayloadBuilder()
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
        .build();
      await db.updateInscriptions(sendPEPE);
      // Deploy and mint 🔥 token
      const deployFIRE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 775621,
          hash: '000000000000000000033b0b78ff68c5767109f45ee42696bd4db9b2845a7ea8',
        })
        .transaction({
          hash: '8354e85e87fa2df8b3a06ec0b9d395559b95174530cb19447fc4df5f6d4ca84d',
        })
        .inscriptionRevealed(
          brc20Reveal({
            json: {
              p: 'brc-20',
              op: 'deploy',
              tick: '🔥',
              max: '1000',
            },
            number: 50,
            tx_id: '8354e85e87fa2df8b3a06ec0b9d395559b95174530cb19447fc4df5f6d4ca84d',
            address: address,
          })
        )
        .build();
      await db.updateInscriptions(deployFIRE);
      const mintFIRE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 775622,
          hash: '00000000000000000001f022fadbd930ccf6acbe00a07626e3a0898fb5799bc9',
        })
        .transaction({
          hash: '81f4ee2c247c5f5c0d3a6753fef706df410ea61c2aa6d370003b98beb041b887',
        })
        .inscriptionRevealed(
          brc20Reveal({
            json: {
              p: 'brc-20',
              op: 'mint',
              tick: '🔥',
              amt: '500',
            },
            number: 60,
            tx_id: '81f4ee2c247c5f5c0d3a6753fef706df410ea61c2aa6d370003b98beb041b887',
            address: address,
          })
        )
        .build();
      await db.updateInscriptions(mintFIRE);
      // Transfer and send 🔥 to self
      const transferFIRE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 775623,
          hash: '00000000000000000002bfcb8860d4730fcd3986b026b9629ea6106fe2cb9197',
        })
        .transaction({
          hash: 'c1c7f1d5c10a30605a8a5285ca3465a4f75758ed9b7f201e5ef62727e179966f',
        })
        .inscriptionRevealed(
          brc20Reveal({
            json: {
              p: 'brc-20',
              op: 'transfer',
              tick: '🔥',
              amt: '100',
            },
            number: 90,
            tx_id: 'c1c7f1d5c10a30605a8a5285ca3465a4f75758ed9b7f201e5ef62727e179966f',
            address: address,
          })
        )
        .build();
      await db.updateInscriptions(transferFIRE);
      const sendFIRE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: 775624,
          hash: '00000000000000000003cbbe6d21f03f531cee6e96f33f4a8277a3d8bce5c759',
        })
        .transaction({
          hash: 'a00d01a3e772ce2219ddf3fe2fe4053be071262d9594f11f018fdada7179ae2d',
        })
        .inscriptionTransferred({
          inscription_id: 'c1c7f1d5c10a30605a8a5285ca3465a4f75758ed9b7f201e5ef62727e179966fi0',
          updated_address: address, // To self
          satpoint_pre_transfer:
            'c1c7f1d5c10a30605a8a5285ca3465a4f75758ed9b7f201e5ef62727e179966f:0:0',
          satpoint_post_transfer:
            'a00d01a3e772ce2219ddf3fe2fe4053be071262d9594f11f018fdada7179ae2d:0:0',
          post_transfer_output_value: null,
          tx_index: 0,
        })
        .build();
      await db.updateInscriptions(sendFIRE);

      // Check counts, total minted, holders, events.
      let request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens`,
      });
      let json = request.json();
      expect(json.total).toBe(2);
      expect(json.results[0].minted_supply).toBe('500.000000000000000000');
      expect(json.results[1].minted_supply).toBe('10000.000000000000000000');
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/PEPE`,
      });
      json = request.json();
      expect(json.supply.holders).toBe(2);
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/🔥`,
      });
      json = request.json();
      expect(json.supply.holders).toBe(1);
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(2);
      expect(json.results).toHaveLength(2);
      expect(json.results[0]).toStrictEqual({
        ticker: 'PEPE',
        available_balance: '1000.000000000000000000',
        transferrable_balance: '0.000000000000000000',
        overall_balance: '1000.000000000000000000',
      });
      expect(json.results[1]).toStrictEqual({
        ticker: '🔥',
        available_balance: '500.000000000000000000',
        transferrable_balance: '0.000000000000000000',
        overall_balance: '500.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      expect(json.results[0]).toStrictEqual({
        ticker: 'PEPE',
        available_balance: '9000.000000000000000000',
        transferrable_balance: '0.000000000000000000',
        overall_balance: '9000.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity`,
      });
      json = request.json();
      expect(json.total).toBe(8);
      expect(json.results).toHaveLength(8);
      expect(json.results[0].operation).toBe('transfer_send');
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?block_height=775622`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      expect(json.results[0].operation).toBe('mint');
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?address=${address}`,
      });
      json = request.json();
      expect(json.total).toBe(8);
      expect(json.results).toHaveLength(8);
      expect(json.results[0].operation).toBe('transfer_send');

      // Rollback: 🔥 is un-sent
      await db.updateInscriptions(rollBack(sendFIRE));
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(2);
      expect(json.results).toHaveLength(2);
      expect(json.results[1]).toStrictEqual({
        ticker: '🔥',
        available_balance: '400.000000000000000000',
        transferrable_balance: '100.000000000000000000',
        overall_balance: '500.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?address=${address}`,
      });
      json = request.json();
      expect(json.total).toBe(7);
      expect(json.results).toHaveLength(7);
      expect(json.results[0].operation).toBe('transfer');

      // Rollback: 🔥 is un-transferred
      await db.updateInscriptions(rollBack(transferFIRE));
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(2);
      expect(json.results).toHaveLength(2);
      expect(json.results[1]).toStrictEqual({
        ticker: '🔥',
        available_balance: '500.000000000000000000',
        transferrable_balance: '0.000000000000000000',
        overall_balance: '500.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?address=${address}`,
      });
      json = request.json();
      expect(json.total).toBe(6);
      expect(json.results).toHaveLength(6);
      expect(json.results[0].operation).toBe('mint');

      // Rollback: 🔥 is un-minted
      await db.updateInscriptions(rollBack(mintFIRE));
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/🔥`,
      });
      json = request.json();
      expect(json.supply.holders).toBe(0);
      expect(json.supply.minted_supply).toBe('0.000000000000000000');
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      expect(json.results[0]).toStrictEqual({
        ticker: 'PEPE',
        available_balance: '1000.000000000000000000',
        transferrable_balance: '0.000000000000000000',
        overall_balance: '1000.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity`,
      });
      json = request.json();
      expect(json.total).toBe(5);
      expect(json.results).toHaveLength(5);
      expect(json.results[0].operation).toBe('deploy');
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?block_height=775622`,
      });
      json = request.json();
      expect(json.total).toBe(0);
      expect(json.results).toHaveLength(0);

      // Rollback 2: 🔥 is un-deployed
      await db.updateInscriptions(rollBack(deployFIRE));
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/🔥`,
      });
      expect(request.statusCode).toBe(404);
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      expect(json.results[0]).toStrictEqual({
        ticker: 'PEPE',
        available_balance: '1000.000000000000000000',
        transferrable_balance: '0.000000000000000000',
        overall_balance: '1000.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity`,
      });
      json = request.json();
      expect(json.total).toBe(4);
      expect(json.results).toHaveLength(4);
      expect(json.results[0].operation).toBe('transfer_send');

      // Rollback 3: PEPE is un-sent
      await db.updateInscriptions(rollBack(sendPEPE));
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      expect(json.results[0]).toStrictEqual({
        ticker: 'PEPE',
        available_balance: '1000.000000000000000000',
        transferrable_balance: '9000.000000000000000000',
        overall_balance: '10000.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/PEPE`,
      });
      json = request.json();
      expect(json.supply.holders).toBe(1);
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}`,
      });
      json = request.json();
      expect(json.total).toBe(0);
      expect(json.results).toHaveLength(0);
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity`,
      });
      json = request.json();
      expect(json.total).toBe(3);
      expect(json.results).toHaveLength(3);
      expect(json.results[0].operation).toBe('transfer');

      // Rollback 4: PEPE is un-transferred
      await db.updateInscriptions(rollBack(transferPEPE));
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      expect(json.results[0]).toStrictEqual({
        ticker: 'PEPE',
        available_balance: '10000.000000000000000000',
        transferrable_balance: '0.000000000000000000',
        overall_balance: '10000.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/PEPE`,
      });
      json = request.json();
      expect(json.supply.holders).toBe(1);
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity`,
      });
      json = request.json();
      expect(json.total).toBe(2);
      expect(json.results).toHaveLength(2);
      expect(json.results[0].operation).toBe('mint');
    });
  });
});

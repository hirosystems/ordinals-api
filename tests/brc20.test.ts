import { buildApiServer } from '../src/api/init';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer, brc20Reveal } from './helpers';

describe('BRC-20', () => {
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
      expect(responseJson1).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: 775617,
        decimals: 18,
        id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        number: 5,
        mint_limit: null,
        max_supply: '21000000',
        ticker: 'PEPE',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      });
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
      expect(responseJson1).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: 775617,
        decimals: 18,
        id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        max_supply: '21000000',
        mint_limit: null,
        number: 5,
        ticker: 'PEPE',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      });
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
      expect(responseJson1).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: 775617,
        decimals: 18,
        id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        max_supply: '21000000',
        mint_limit: null,
        number: 5,
        ticker: 'PEPE',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      });
      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=pepe`, // Lowercase
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: 775617,
        decimals: 18,
        id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        max_supply: '21000000',
        mint_limit: null,
        number: 5,
        ticker: 'PEPE',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      });
    });

    test.skip('deploy exceeds decimal limit', async () => {});

    test.skip('deploy exceeds supply limit', async () => {});
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
        url: `/ordinals/brc-20/balances?address=${address}`,
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
        url: `/ordinals/brc-20/balances?address=${address}`,
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
        url: `/ordinals/brc-20/balances?address=${address}`,
      });
      expect(response2.statusCode).toBe(200);
      const responseJson2 = response2.json();
      expect(responseJson2.total).toBe(0);
      expect(responseJson2.results).toStrictEqual([]);
    });

    test.skip('mint exceeds token supply', async () => {});

    test.skip('mints in same block are applied in order', async () => {});

    test('ignores mint for non-existent token', async () => {});

    test('mint exceeds token mint limit', async () => {});

    test('ignores mint for token with no more supply', async () => {});
  });
});

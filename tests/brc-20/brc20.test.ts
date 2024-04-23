import { runMigrations } from '@hirosystems/api-toolkit';
import { buildApiServer } from '../../src/api/init';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import {
  BRC20_GENESIS_BLOCK,
  BRC20_SELF_MINT_ACTIVATION_BLOCK,
  TestChainhookPayloadBuilder,
  TestFastifyServer,
  deployAndMintPEPE,
  rollBack,
} from '../helpers';

describe('BRC-20', () => {
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

  describe('deploy', () => {
    test('deploy is saved', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
            timestamp: 1677811111,
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .brc20(
            {
              deploy: {
                inscription_id:
                  '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
                tick: 'pepe',
                max: '21000000',
                lim: '1000',
                dec: '18',
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=pepe`,
      });
      expect(response1.statusCode).toBe(200);
      const responseJson1 = response1.json();
      expect(responseJson1.total).toBe(1);
      expect(responseJson1.results).toStrictEqual([
        {
          address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          block_height: BRC20_GENESIS_BLOCK,
          decimals: 18,
          id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          number: 0,
          mint_limit: '1000.000000000000000000',
          max_supply: '21000000.000000000000000000',
          ticker: 'pepe',
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          deploy_timestamp: 1677811111000,
          minted_supply: '0.000000000000000000',
          tx_count: 1,
          self_mint: false,
        },
      ]);
    });

    test('deploy with self_mint is saved', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
            timestamp: 1677811111,
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .brc20(
            {
              deploy: {
                inscription_id:
                  '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
                tick: '$pepe',
                max: '21000000',
                lim: '1000',
                dec: '18',
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                self_mint: true,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      const response1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=$pepe`,
      });
      expect(response1.statusCode).toBe(200);
      const responseJson1 = response1.json();
      expect(responseJson1.total).toBe(1);
      expect(responseJson1.results[0]).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: 837090,
        decimals: 18,
        deploy_timestamp: 1677811111000,
        id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
        max_supply: '21000000.000000000000000000',
        mint_limit: '1000.000000000000000000',
        self_mint: true,
        minted_supply: '0.000000000000000000',
        number: 0,
        ticker: '$pepe',
        tx_count: 1,
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      });
    });
  });

  describe('mint', () => {
    test('valid mints are saved and balance reflected', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .brc20(
            {
              deploy: {
                inscription_id:
                  '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
                tick: 'pepe',
                max: '21000000',
                lim: '250000',
                dec: '18',
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK + 1,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .brc20(
            {
              mint: {
                tick: 'pepe',
                amt: '250000',
                inscription_id:
                  '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99fi0',
                address,
              },
            },
            { inscription_number: 1 }
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
          ticker: 'pepe',
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
            height: BRC20_GENESIS_BLOCK + 2,
            hash: '0000000000000000000077163227125e51d838787d6af031bc9b55a3a1cc1b2c',
          })
          .transaction({
            hash: '7a1adbc3e93ddf8d7c4e0ba75aa11c98c431521dd850be8b955feedb716d8bec',
          })
          .brc20(
            {
              mint: {
                tick: 'pepe',
                amt: '100000',
                inscription_id:
                  '7a1adbc3e93ddf8d7c4e0ba75aa11c98c431521dd850be8b955feedb716d8beci0',
                address,
              },
            },
            { inscription_number: 2 }
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
          ticker: 'pepe',
          available_balance: '350000.000000000000000000',
          overall_balance: '350000.000000000000000000',
          transferrable_balance: '0.000000000000000000',
        },
      ]);

      const response3 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=pepe`,
      });
      expect(response3.statusCode).toBe(200);
      const responseJson3 = response3.json();
      expect(responseJson3.total).toBe(1);
      expect(responseJson3.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ticker: 'pepe', minted_supply: '350000.000000000000000000' }),
        ])
      );
    });

    test('valid self mints are saved and balance reflected', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .brc20(
            {
              deploy: {
                inscription_id:
                  '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
                tick: '$pepe',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address,
                self_mint: true,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK + 1,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .brc20(
            {
              mint: {
                inscription_id:
                  '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99fi0',
                tick: '$pepe',
                address,
                amt: '250000',
              },
            },
            { inscription_number: 1 }
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
          ticker: '$pepe',
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
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK + 2,
            hash: '0000000000000000000077163227125e51d838787d6af031bc9b55a3a1cc1b2c',
          })
          .transaction({
            hash: '7a1adbc3e93ddf8d7c4e0ba75aa11c98c431521dd850be8b955feedb716d8bec',
          })
          .brc20(
            {
              mint: {
                inscription_id:
                  '7a1adbc3e93ddf8d7c4e0ba75aa11c98c431521dd850be8b955feedb716d8beci0',
                tick: '$pepe',
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                amt: '100000',
              },
            },
            { inscription_number: 2 }
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
          ticker: '$pepe',
          available_balance: '350000.000000000000000000',
          overall_balance: '350000.000000000000000000',
          transferrable_balance: '0.000000000000000000',
        },
      ]);

      const response3 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=$pepe`,
      });
      expect(response3.statusCode).toBe(200);
      const responseJson3 = response3.json();
      expect(responseJson3.total).toBe(1);
      expect(responseJson3.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ticker: '$pepe', minted_supply: '350000.000000000000000000' }),
        ])
      );
    });

    test('valid self mints for tokens with max 0 are saved', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .brc20(
            {
              deploy: {
                inscription_id:
                  '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
                tick: '$pepe',
                max: '0',
                lim: '250000',
                dec: '18',
                address,
                self_mint: true,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK + 1,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .brc20(
            {
              mint: {
                inscription_id:
                  '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99fi0',
                tick: '$pepe',
                address,
                amt: '250000',
              },
            },
            { inscription_number: 1 }
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
          ticker: '$pepe',
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
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK + 2,
            hash: '0000000000000000000077163227125e51d838787d6af031bc9b55a3a1cc1b2c',
          })
          .transaction({
            hash: '7a1adbc3e93ddf8d7c4e0ba75aa11c98c431521dd850be8b955feedb716d8bec',
          })
          .brc20(
            {
              mint: {
                inscription_id:
                  '7a1adbc3e93ddf8d7c4e0ba75aa11c98c431521dd850be8b955feedb716d8beci0',
                tick: '$pepe',
                address,
                amt: '100000',
              },
            },
            { inscription_number: 2 }
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
          ticker: '$pepe',
          available_balance: '350000.000000000000000000',
          overall_balance: '350000.000000000000000000',
          transferrable_balance: '0.000000000000000000',
        },
      ]);

      const response3 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens?ticker=$pepe`,
      });
      expect(response3.statusCode).toBe(200);
      const responseJson3 = response3.json();
      expect(responseJson3.total).toBe(1);
      expect(responseJson3.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ticker: '$pepe', minted_supply: '350000.000000000000000000' }),
        ])
      );
    });

    test('rollback mints deduct balance correctly', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .brc20(
            {
              deploy: {
                inscription_id:
                  '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
                tick: 'pepe',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address,
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK + 1,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .brc20(
            {
              mint: {
                inscription_id:
                  '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99fi0',
                tick: 'pepe',
                address,
                amt: '250000',
              },
            },
            { inscription_number: 1 }
          )
          .build()
      );
      // Rollback
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .rollback()
          .block({
            height: BRC20_GENESIS_BLOCK + 2,
            hash: '0000000000000000000077163227125e51d838787d6af031bc9b55a3a1cc1b2c',
          })
          .transaction({
            hash: '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99f',
          })
          .brc20(
            {
              mint: {
                inscription_id:
                  '8aec77f855549d98cb9fb5f35e02a03f9a2354fd05a5f89fc610b32c3b01f99fi0',
                tick: 'pepe',
                address,
                amt: '250000',
              },
            },
            { inscription_number: 1 }
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
        url: `/ordinals/brc-20/tokens/pepe`,
      });
      expect(response3.json().token.minted_supply).toBe('0.000000000000000000');
    });
  });

  describe('transfer', () => {
    test('available balance decreases on transfer inscription', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await deployAndMintPEPE(db, address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK + 2,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .brc20(
            {
              transfer: {
                inscription_id:
                  'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
                tick: 'pepe',
                address,
                amt: '2000',
              },
            },
            { inscription_number: 2 }
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
          ticker: 'pepe',
          transferrable_balance: '2000.000000000000000000',
        },
      ]);

      // Balance at previous block
      const response2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}?block_height=779833`,
      });
      const json2 = response2.json();
      expect(json2.results[0].available_balance).toBe('10000.000000000000000000');
    });

    test('multiple transfers in block', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await deployAndMintPEPE(db, address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK + 2,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .brc20(
            {
              transfer: {
                inscription_id:
                  'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
                tick: 'pepe',
                address,
                amt: '9000',
              },
            },
            { inscription_number: 2 }
          )
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .brc20(
            {
              transfer: {
                inscription_id:
                  '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21baci0',
                tick: 'pepe',
                address,
                amt: '1000',
              },
            },
            { inscription_number: 3 }
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
          available_balance: '0.000000000000000000',
          overall_balance: '10000.000000000000000000',
          ticker: 'pepe',
          transferrable_balance: '10000.000000000000000000',
        },
      ]);
    });

    test('send balance to address', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      const address2 = '3QNjwPDRafjBm9XxJpshgk3ksMJh3TFxTU';
      await deployAndMintPEPE(db, address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK + 2,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .brc20(
            {
              transfer: {
                inscription_id:
                  'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
                tick: 'pepe',
                address,
                amt: '9000',
              },
            },
            { inscription_number: 2 }
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK + 3,
            hash: '00000000000000000003feae13d107f0f2c4fb4dd08fb2a8b1ab553512e77f03',
          })
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .brc20(
            {
              transfer_send: {
                tick: 'pepe',
                inscription_id:
                  'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
                amt: '9000',
                sender_address: address,
                receiver_address: address2,
              },
            },
            { inscription_number: 2 }
          )
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
          ticker: 'pepe',
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
          ticker: 'pepe',
          transferrable_balance: '0.000000000000000000',
        },
      ]);

      // Balance at previous block
      const prevBlock1 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}?block_height=779833`,
      });
      const prevBlockJson1 = prevBlock1.json();
      expect(prevBlockJson1.results[0].available_balance).toBe('10000.000000000000000000');
      const prevBlock2 = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address2}?block_height=779833`,
      });
      const prevBlockJson2 = prevBlock2.json();
      expect(prevBlockJson2.results[0]).toBeUndefined();
    });

    test('send balance for self_mint token to address', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      const address2 = '3QNjwPDRafjBm9XxJpshgk3ksMJh3TFxTU';
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK,
            hash: '00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
          })
          .transaction({
            hash: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          })
          .brc20(
            {
              deploy: {
                inscription_id:
                  '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
                tick: '$pepe',
                max: '0',
                lim: '21000000',
                dec: '18',
                address,
                self_mint: true,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK + 1,
            hash: '0000000000000000000098d8f2663891d439f6bb7de230d4e9f6bcc2e85452bf',
          })
          .transaction({
            hash: '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0f',
          })
          .brc20(
            {
              mint: {
                inscription_id:
                  '3b55f624eaa4f8de6c42e0c490176b67123a83094384f658611faf7bfb85dd0fi0',
                tick: '$pepe',
                address,
                amt: '10000',
              },
            },
            { inscription_number: 1 }
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK + 2,
            hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
          })
          .transaction({
            hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
          })
          .brc20(
            {
              transfer: {
                inscription_id:
                  'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
                tick: '$pepe',
                address,
                amt: '9000',
              },
            },
            { inscription_number: 2 }
          )
          .build()
      );
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_SELF_MINT_ACTIVATION_BLOCK + 3,
            hash: '00000000000000000003feae13d107f0f2c4fb4dd08fb2a8b1ab553512e77f03',
          })
          .transaction({
            hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
          })
          .brc20(
            {
              transfer_send: {
                inscription_id:
                  'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
                tick: '$pepe',
                amt: '9000',
                sender_address: address,
                receiver_address: address2,
              },
            },
            { inscription_number: 2 }
          )
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
          ticker: '$pepe',
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
          ticker: '$pepe',
          transferrable_balance: '0.000000000000000000',
        },
      ]);
    });

    test('explicit transfer to self restores balance correctly', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await deployAndMintPEPE(db, address);
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
          .brc20(
            {
              transfer: {
                inscription_id:
                  '825a25b64b5d99ca30e04e53cc9a3020412e1054eb2a7523eb075ddd6d983205i0',
                tick: 'pepe',
                address,
                amt: '20',
              },
            },
            { inscription_number: 2 }
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
          .brc20(
            {
              transfer_send: {
                inscription_id:
                  '825a25b64b5d99ca30e04e53cc9a3020412e1054eb2a7523eb075ddd6d983205i0',
                tick: 'pepe',
                amt: '20',
                sender_address: address,
                receiver_address: address2,
              },
            },
            { inscription_number: 2 }
          )
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
          ticker: 'pepe',
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
          .brc20(
            {
              transfer: {
                inscription_id:
                  '09a812f72275892b4858880cf3821004a6e8885817159b340639afe9952ac053i0',
                tick: 'pepe',
                address: address2,
                amt: '20',
              },
            },
            { inscription_number: 3 }
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
          ticker: 'pepe',
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
          .brc20(
            {
              transfer_send: {
                inscription_id:
                  '09a812f72275892b4858880cf3821004a6e8885817159b340639afe9952ac053i0',
                tick: 'pepe',
                amt: '20',
                sender_address: address2,
                receiver_address: address2,
              },
            },
            { inscription_number: 3 }
          )
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
          ticker: 'pepe',
          transferrable_balance: '0.000000000000000000',
        },
      ]);
    });
  });

  describe('rollbacks', () => {
    test('reflects rollbacks on balances and counts correctly', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      const address2 = '3QNjwPDRafjBm9XxJpshgk3ksMJh3TFxTU';
      await deployAndMintPEPE(db, address);

      // Transfer and send pepe
      const transferPEPE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: BRC20_GENESIS_BLOCK + 2,
          hash: '00000000000000000002b14f0c5dde0b2fc74d022e860696bd64f1f652756674',
        })
        .transaction({
          hash: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47a',
        })
        .brc20(
          {
            transfer: {
              inscription_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
              tick: 'pepe',
              address,
              amt: '9000',
            },
          },
          { inscription_number: 2 }
        )
        .build();
      await db.updateInscriptions(transferPEPE);
      const sendPEPE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: BRC20_GENESIS_BLOCK + 3,
          hash: '000000000000000000016ddf56d0fe72476165acee9500d48d3e2aaf8412f489',
        })
        .transaction({
          hash: '7edaa48337a94da327b6262830505f116775a32db5ad4ad46e87ecea33f21bac',
        })
        .brc20(
          {
            transfer_send: {
              inscription_id: 'eee52b22397ea4a4aefe6a39931315e93a157091f5a994216c0aa9c8c6fef47ai0',
              tick: 'pepe',
              amt: '9000',
              sender_address: address,
              receiver_address: address2,
            },
          },
          { inscription_number: 2 }
        )
        .build();
      await db.updateInscriptions(sendPEPE);
      // Deploy and mint 🔥 token
      const deployFIRE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: BRC20_GENESIS_BLOCK + 4,
          hash: '000000000000000000033b0b78ff68c5767109f45ee42696bd4db9b2845a7ea8',
        })
        .transaction({
          hash: '8354e85e87fa2df8b3a06ec0b9d395559b95174530cb19447fc4df5f6d4ca84d',
        })
        .brc20(
          {
            deploy: {
              inscription_id: '8354e85e87fa2df8b3a06ec0b9d395559b95174530cb19447fc4df5f6d4ca84di0',
              tick: '🔥',
              max: '1000',
              lim: '1000',
              dec: '18',
              address,
              self_mint: false,
            },
          },
          { inscription_number: 3 }
        )
        .build();
      await db.updateInscriptions(deployFIRE);
      const mintFIRE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: BRC20_GENESIS_BLOCK + 5,
          hash: '00000000000000000001f022fadbd930ccf6acbe00a07626e3a0898fb5799bc9',
        })
        .transaction({
          hash: '81f4ee2c247c5f5c0d3a6753fef706df410ea61c2aa6d370003b98beb041b887',
        })
        .brc20(
          {
            mint: {
              inscription_id: '81f4ee2c247c5f5c0d3a6753fef706df410ea61c2aa6d370003b98beb041b887i0',
              tick: '🔥',
              address,
              amt: '500',
            },
          },
          { inscription_number: 4 }
        )
        .build();
      await db.updateInscriptions(mintFIRE);
      // Transfer and send 🔥 to self
      const transferFIRE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: BRC20_GENESIS_BLOCK + 6,
          hash: '00000000000000000002bfcb8860d4730fcd3986b026b9629ea6106fe2cb9197',
        })
        .transaction({
          hash: 'c1c7f1d5c10a30605a8a5285ca3465a4f75758ed9b7f201e5ef62727e179966f',
        })
        .brc20(
          {
            transfer: {
              inscription_id: 'c1c7f1d5c10a30605a8a5285ca3465a4f75758ed9b7f201e5ef62727e179966fi0',
              tick: '🔥',
              address,
              amt: '100',
            },
          },
          { inscription_number: 5 }
        )
        .build();
      await db.updateInscriptions(transferFIRE);
      const sendFIRE = new TestChainhookPayloadBuilder()
        .apply()
        .block({
          height: BRC20_GENESIS_BLOCK + 7,
          hash: '00000000000000000003cbbe6d21f03f531cee6e96f33f4a8277a3d8bce5c759',
        })
        .transaction({
          hash: 'a00d01a3e772ce2219ddf3fe2fe4053be071262d9594f11f018fdada7179ae2d',
        })
        .brc20(
          {
            transfer_send: {
              tick: '🔥',
              inscription_id: 'c1c7f1d5c10a30605a8a5285ca3465a4f75758ed9b7f201e5ef62727e179966fi0',
              amt: '100',
              sender_address: address,
              receiver_address: address,
            },
          },
          { inscription_number: 5 }
        )
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
        url: `/ordinals/brc-20/tokens/pepe`,
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
        ticker: 'pepe',
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
        ticker: 'pepe',
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
        url: `/ordinals/brc-20/activity?block_height=${BRC20_GENESIS_BLOCK + 5}`,
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
        ticker: 'pepe',
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
        url: `/ordinals/brc-20/activity?block_height=${BRC20_GENESIS_BLOCK + 5}`,
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
        ticker: 'pepe',
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

      // Rollback 3: pepe is un-sent
      await db.updateInscriptions(rollBack(sendPEPE));
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      expect(json.results[0]).toStrictEqual({
        ticker: 'pepe',
        available_balance: '1000.000000000000000000',
        transferrable_balance: '9000.000000000000000000',
        overall_balance: '10000.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/pepe`,
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

      // Rollback 4: pepe is un-transferred
      await db.updateInscriptions(rollBack(transferPEPE));
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/balances/${address}`,
      });
      json = request.json();
      expect(json.total).toBe(1);
      expect(json.results).toHaveLength(1);
      expect(json.results[0]).toStrictEqual({
        ticker: 'pepe',
        available_balance: '10000.000000000000000000',
        transferrable_balance: '0.000000000000000000',
        overall_balance: '10000.000000000000000000',
      });
      request = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/pepe`,
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

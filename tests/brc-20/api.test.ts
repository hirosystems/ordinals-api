import { runMigrations } from '@hirosystems/api-toolkit';
import { buildApiServer } from '../../src/api/init';
import { Brc20ActivityResponse, Brc20TokenResponse } from '../../src/api/schemas';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import {
  BRC20_GENESIS_BLOCK,
  TestChainhookPayloadBuilder,
  TestFastifyServer,
  deployAndMintPEPE,
  incrementing,
  randomHash,
} from '../helpers';

describe('BRC-20 API', () => {
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

  describe('/brc-20/tokens', () => {
    test('tokens endpoint', async () => {
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: BRC20_GENESIS_BLOCK })
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
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/pepe`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        token: {
          id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
          number: 0,
          block_height: BRC20_GENESIS_BLOCK,
          tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
          address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
          ticker: 'pepe',
          max_supply: '21000000.000000000000000000',
          mint_limit: '21000000.000000000000000000',
          decimals: 18,
          deploy_timestamp: 1677803510000,
          minted_supply: '0.000000000000000000',
          tx_count: 1,
          self_mint: false,
        },
        supply: {
          max_supply: '21000000.000000000000000000',
          minted_supply: '0.000000000000000000',
          holders: 0,
        },
      });
    });

    test('tokens filter by ticker prefix', async () => {
      const inscriptionNumbers = incrementing(0);
      const blockHeights = incrementing(BRC20_GENESIS_BLOCK);

      let transferHash = randomHash();
      let number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: transferHash })
          .brc20(
            {
              deploy: {
                inscription_id: `${transferHash}i0`,
                tick: 'pepe',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );

      transferHash = randomHash();
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: transferHash })
          .brc20(
            {
              deploy: {
                inscription_id: `${transferHash}i0`,
                tick: 'peer',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                self_mint: false,
              },
            },
            { inscription_number: 1 }
          )
          .build()
      );

      transferHash = randomHash();
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: transferHash })
          .brc20(
            {
              deploy: {
                inscription_id: `${transferHash}i0`,
                tick: 'abcd',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                self_mint: false,
              },
            },
            { inscription_number: 2 }
          )
          .build()
      );

      transferHash = randomHash();
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: transferHash })
          .brc20(
            {
              deploy: {
                inscription_id: `${transferHash}i0`,
                tick: 'dcba',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
                self_mint: false,
              },
            },
            { inscription_number: 3 }
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
          expect.objectContaining({ ticker: 'pepe' }),
          expect.objectContaining({ ticker: 'peer' }),
          expect.objectContaining({ ticker: 'abcd' }),
        ])
      );
    });

    test('tokens using order_by tx_count', async () => {
      // Setup
      const inscriptionNumbers = incrementing(0);
      const blockHeights = incrementing(BRC20_GENESIS_BLOCK);
      const addressA = 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz';
      const addressB = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

      // A deploys pepe
      let number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              deploy: {
                inscription_id: `${randomHash()}i0`,
                tick: 'pepe',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: addressA,
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );

      // A mints 10000 pepe 10 times (will later be rolled back)
      const pepeMints = [];
      for (let i = 0; i < 10; i++) {
        const txHash = randomHash();
        number = inscriptionNumbers.next().value;
        const payload = new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: txHash })
          .brc20(
            {
              mint: {
                inscription_id: `${txHash}i0`,
                tick: 'pepe',
                address: addressA,
                amt: '10000',
              },
            },
            { inscription_number: i + 1 }
          )
          .build();
        pepeMints.push(payload);
        await db.updateInscriptions(payload);
      }

      // B deploys abcd
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              deploy: {
                inscription_id: `${randomHash()}i0`,
                tick: 'abcd',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: addressB,
                self_mint: false,
              },
            },
            { inscription_number: 11 }
          )
          .build()
      );

      // B mints 10000 abcd
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              mint: {
                inscription_id: `${randomHash()}i0`,
                tick: 'abcd',
                address: addressA,
                amt: '10000',
              },
            },
            { inscription_number: 12 }
          )
          .build()
      );

      // B send 1000 abcd to A
      // (create inscription, transfer)
      const txHashTransfer = randomHash();
      number = inscriptionNumbers.next().value;
      const payloadTransfer = new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: blockHeights.next().value })
        .transaction({ hash: txHashTransfer })
        .brc20(
          {
            transfer: {
              inscription_id: `${txHashTransfer}i0`,
              tick: 'abcd',
              address: addressB,
              amt: '1000',
            },
          },
          { inscription_number: 13 }
        )
        .build();
      await db.updateInscriptions(payloadTransfer);
      // (send inscription, transfer_send)
      const txHashTransferSend = randomHash();
      const payloadTransferSend = new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: blockHeights.next().value })
        .transaction({ hash: txHashTransferSend })
        .brc20(
          {
            transfer_send: {
              tick: 'abcd',
              inscription_id: `${txHashTransfer}i0`,
              amt: '1000',
              sender_address: addressB,
              receiver_address: addressA,
            },
          },
          { inscription_number: 13 }
        )
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
        // The first result is the token with the latest activity (abcd)
        expect.objectContaining({
          ticker: 'abcd',
          tx_count: 4,
        } as Brc20TokenResponse),
        expect.objectContaining({
          ticker: 'pepe',
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

      // WITH tx_count sort: The first result is the most active token (pepe)
      expect(json.results).toEqual([
        expect.objectContaining({
          ticker: 'pepe',
          tx_count: 11,
        } as Brc20TokenResponse),
        expect.objectContaining({
          ticker: 'abcd',
          tx_count: 4,
        } as Brc20TokenResponse),
      ]);

      // Rollback pepe mints
      for (const payload of pepeMints) {
        const payloadRollback = { ...payload, apply: [], rollback: payload.apply };
        await db.updateInscriptions(payloadRollback);
      }

      // WITH tx_count sort: The first result is the most active token (now abcd)
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
          ticker: 'abcd',
          tx_count: 4,
        } as Brc20TokenResponse),
        expect.objectContaining({
          ticker: 'pepe',
          tx_count: 1, // only the deploy remains
        } as Brc20TokenResponse),
      ]);

      // Rollback abcd transfer
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
          ticker: 'abcd',
          tx_count: 2, // only the deploy and mint remain
        } as Brc20TokenResponse),
        expect.objectContaining({
          ticker: 'pepe',
          tx_count: 1,
        } as Brc20TokenResponse),
      ]);
    });
  });

  describe('/brc-20/activity', () => {
    test('activity for token transfers', async () => {
      // Setup
      const inscriptionNumbers = incrementing(0);
      const blockHeights = incrementing(BRC20_GENESIS_BLOCK);
      const addressA = 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz';
      const addressB = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

      // A deploys pepe
      let number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              deploy: {
                inscription_id: `${randomHash()}i0`,
                tick: 'pepe',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: addressA,
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );

      // Verify that the pepe deploy is in the activity feed
      let response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      let json = response.json();
      expect(json.total).toBe(1);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'deploy',
            ticker: 'pepe',
            address: addressA,
            deploy: expect.objectContaining({
              max_supply: '21000000.000000000000000000',
            }),
          } as Brc20ActivityResponse),
        ])
      );

      // A mints 10000 pepe
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              mint: {
                inscription_id: `${randomHash()}i0`,
                tick: 'pepe',
                address: addressA,
                amt: '10000',
              },
            },
            { inscription_number: 1 }
          )
          .build()
      );

      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(2);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'deploy',
            ticker: 'pepe',
          } as Brc20ActivityResponse),
          expect.objectContaining({
            operation: 'mint',
            ticker: 'pepe',
            address: addressA,
            mint: {
              amount: '10000.000000000000000000',
            },
          } as Brc20ActivityResponse),
        ])
      );

      // B mints 10000 pepe
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              mint: {
                inscription_id: `${randomHash()}i0`,
                tick: 'pepe',
                address: addressB,
                amt: '10000',
              },
            },
            { inscription_number: 2 }
          )
          .build()
      );

      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(3);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'mint',
            ticker: 'pepe',
            address: addressB,
            mint: {
              amount: '10000.000000000000000000',
            },
          } as Brc20ActivityResponse),
        ])
      );

      // A creates transfer of 9000 pepe
      const transferHash = randomHash();
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: transferHash })
          .brc20(
            {
              transfer: {
                inscription_id: `${transferHash}i0`,
                tick: 'pepe',
                address: addressA,
                amt: '9000',
              },
            },
            { inscription_number: 3 }
          )
          .build()
      );

      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(4);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer',
            ticker: 'pepe',
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
          .brc20(
            {
              transfer_send: {
                tick: 'pepe',
                inscription_id: `${transferHash}i0`,
                amt: '9000',
                sender_address: addressA,
                receiver_address: addressB,
              },
            },
            { inscription_number: 3 }
          )
          .build()
      );

      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(5);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer_send',
            ticker: 'pepe',
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
        url: `/ordinals/brc-20/activity?ticker=pepe&operation=transfer_send`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(1);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer_send',
            ticker: 'pepe',
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
      const inscriptionNumbers = incrementing(0);
      const blockHeights = incrementing(BRC20_GENESIS_BLOCK);
      const addressA = 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz';
      const addressB = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
      const addressC = 'bc1q9d80h0q5d3f54w7w8c3l2sguf9uset4ydw9xj2';

      // Step 1: A deploys a token
      let number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              deploy: {
                inscription_id: `${randomHash()}i0`,
                tick: 'pepe',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: addressA,
                self_mint: false,
              },
            },
            { inscription_number: number }
          )
          .build()
      );

      // Verify that the pepe deploy is in the activity feed
      let response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      let json = response.json();
      expect(json.total).toBe(1);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'deploy',
            ticker: 'pepe',
            address: addressA,
            deploy: expect.objectContaining({
              max_supply: '21000000.000000000000000000',
            }),
          } as Brc20ActivityResponse),
        ])
      );

      // Step 2: A mints 1000 of the token
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              mint: {
                inscription_id: `${randomHash()}i0`,
                tick: 'pepe',
                address: addressA,
                amt: '1000',
              },
            },
            { inscription_number: number }
          )
          .build()
      );

      // Verify that the pepe mint is in the activity feed
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(2);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'mint',
            ticker: 'pepe',
            address: addressA,
            mint: {
              amount: '1000.000000000000000000',
            },
          } as Brc20ActivityResponse),
        ])
      );
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe&address=${addressA}`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(2);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'deploy',
            ticker: 'pepe',
            address: addressA,
            deploy: expect.objectContaining({
              max_supply: '21000000.000000000000000000',
            }),
          } as Brc20ActivityResponse),
          expect.objectContaining({
            operation: 'mint',
            ticker: 'pepe',
            address: addressA,
            mint: {
              amount: '1000.000000000000000000',
            },
          } as Brc20ActivityResponse),
        ])
      );

      // Step 3: B mints 2000 of the token
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              mint: {
                inscription_id: `${randomHash()}i0`,
                tick: 'pepe',
                address: addressB,
                amt: '2000',
              },
            },
            { inscription_number: number }
          )
          .build()
      );

      // Verify that the pepe mint is in the activity feed
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(3);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'mint',
            ticker: 'pepe',
            address: addressB,
            mint: {
              amount: '2000.000000000000000000',
            },
          } as Brc20ActivityResponse),
        ])
      );

      // Step 4: A creates a transfer to B
      const transferHashAB = randomHash();
      const numberAB = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: transferHashAB })
          .brc20(
            {
              transfer: {
                inscription_id: `${transferHashAB}i0`,
                tick: 'pepe',
                address: addressA,
                amt: '1000',
              },
            },
            { inscription_number: numberAB }
          )
          .build()
      );

      // Verify that the pepe transfer is in the activity feed
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(4);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer',
            ticker: 'pepe',
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
        url: `/ordinals/brc-20/activity?ticker=pepe&address=${addressA}`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(3);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer',
            ticker: 'pepe',
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
      const numberBC = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: transferHashBC })
          .brc20(
            {
              transfer: {
                inscription_id: `${transferHashBC}i0`,
                tick: 'pepe',
                address: addressB,
                amt: '2000',
              },
            },
            { inscription_number: numberBC }
          )
          .build()
      );

      // Verify that the pepe transfer is in the activity feed
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(5);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer',
            ticker: 'pepe',
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
          .brc20(
            {
              transfer_send: {
                tick: 'pepe',
                inscription_id: `${transferHashAB}i0`,
                amt: '1000',
                sender_address: addressA,
                receiver_address: addressB,
              },
            },
            { inscription_number: numberAB }
          )
          .build()
      );
      // A gets the transfer send in its feed
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe&address=${addressA}`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(4);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer_send',
            ticker: 'pepe',
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
        url: `/ordinals/brc-20/activity?ticker=pepe&address=${addressB}`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(3);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer_send',
            ticker: 'pepe',
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

      // Verify that the pepe transfer_send is in the activity feed
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(6);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer_send',
            ticker: 'pepe',
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
          .brc20(
            {
              transfer_send: {
                tick: 'pepe',
                inscription_id: `${transferHashBC}i0`,
                amt: '2000',
                sender_address: addressB,
                receiver_address: addressC,
              },
            },
            { inscription_number: numberBC }
          )
          .build()
      );

      // Verify that the pepe transfer_send is in the activity feed
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?ticker=pepe`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(7);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer_send',
            ticker: 'pepe',
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
        url: `/ordinals/brc-20/activity?ticker=pepe&address=${addressB}`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(4);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer_send',
            ticker: 'pepe',
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
        url: `/ordinals/brc-20/activity?ticker=pepe&address=${addressC}`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(1);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'transfer_send',
            ticker: 'pepe',
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
      const inscriptionNumbers = incrementing(0);
      const blockHeights = incrementing(BRC20_GENESIS_BLOCK);
      const addressA = 'bc1q6uwuet65rm6xvlz7ztw2gvdmmay5uaycu03mqz';

      // Step 1: Create a token pepe
      let number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              deploy: {
                inscription_id: `${randomHash()}i0`,
                tick: 'pepe',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: addressA,
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );

      // Verify that the pepe deploy is in the activity feed
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
            ticker: 'pepe',
            address: addressA,
            deploy: expect.objectContaining({
              max_supply: '21000000.000000000000000000',
            }),
          } as Brc20ActivityResponse),
        ])
      );

      // Step 2: Create a token peer
      number = inscriptionNumbers.next().value;
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: blockHeights.next().value })
          .transaction({ hash: randomHash() })
          .brc20(
            {
              deploy: {
                inscription_id: `${randomHash()}i0`,
                tick: 'peer',
                max: '21000000',
                lim: '21000000',
                dec: '18',
                address: addressA,
                self_mint: false,
              },
            },
            { inscription_number: 1 }
          )
          .build()
      );

      // Verify that the peer deploy is in the activity feed
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
            ticker: 'peer',
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
        url: `/ordinals/brc-20/activity?ticker=peer&block_height=${BRC20_GENESIS_BLOCK}`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(0);
      expect(json.results).toEqual([]);

      // Verify that the peer deploy is not in the activity feed when using block_height parameter
      response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/activity?block_height=${BRC20_GENESIS_BLOCK}`,
      });
      expect(response.statusCode).toBe(200);
      json = response.json();
      expect(json.total).toBe(1);
      expect(json.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'deploy',
            ticker: 'pepe',
            address: addressA,
            deploy: expect.objectContaining({
              max_supply: '21000000.000000000000000000',
            }),
          } as Brc20ActivityResponse),
        ])
      );
      // Should NOT include peer at this block height
      expect(json.results).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ticker: 'peer',
          } as Brc20ActivityResponse),
        ])
      );
    });
  });

  describe('/brc-20/token/holders', () => {
    test('displays holders for token', async () => {
      const address = 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td';
      await deployAndMintPEPE(db, address);
      await db.updateInscriptions(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({
            height: BRC20_GENESIS_BLOCK + 2,
            hash: '0000000000000000000034dd2daec375371800da441b17651459b2220cbc1a6e',
          })
          .transaction({
            hash: '633648e0e1ddcab8dea0496a561f2b08c486ae619b5634d7bb55d7f0cd32ef16',
          })
          .brc20(
            {
              mint: {
                inscription_id:
                  '633648e0e1ddcab8dea0496a561f2b08c486ae619b5634d7bb55d7f0cd32ef16i0',
                tick: 'pepe',
                address: 'bc1qp9jgp9qtlhgvwjnxclj6kav6nr2fq09c206pyl',
                amt: '2000',
              },
            },
            { inscription_number: 2 }
          )
          .build()
      );

      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/pepe/holders`,
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
                max: '250000',
                lim: '250000',
                dec: '18',
                address: 'bc1qp9jgp9qtlhgvwjnxclj6kav6nr2fq09c206pyl',
                self_mint: false,
              },
            },
            { inscription_number: 0 }
          )
          .build()
      );
      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/pepe/holders`,
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(0);
      expect(json.results).toStrictEqual([]);
    });

    test('shows 404 on token not found', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/brc-20/tokens/pepe/holders`,
      });
      expect(response.statusCode).toBe(404);
    });
  });
});

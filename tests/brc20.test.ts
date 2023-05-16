import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder, brc20Reveal } from './helpers';

describe('BRC-20', () => {
  let db: PgStore;

  beforeEach(async () => {
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations();
  });

  afterEach(async () => {
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
      const deploy = await db.getBrc20Deploy({ ticker: 'PEPE' });
      expect(deploy).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: '775617',
        decimals: 18,
        id: '1',
        inscription_id: '1',
        limit: null,
        max: '21000000',
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
      const deploy = await db.getBrc20Deploy({ ticker: 'PEPE' });
      expect(deploy).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: '775617',
        decimals: 18,
        id: '1',
        inscription_id: '1',
        limit: null,
        max: '21000000',
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
      const deploy = await db.getBrc20Deploy({ ticker: 'PEPE' });
      expect(deploy).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: '775617',
        decimals: 18,
        id: '1',
        inscription_id: '1',
        limit: null,
        max: '21000000',
        ticker: 'PEPE',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      });
      const deploy2 = await db.getBrc20Deploy({ ticker: 'pepe' }); // Lowercase
      expect(deploy2).toStrictEqual({
        address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        block_height: '775617',
        decimals: 18,
        id: '1',
        inscription_id: '1',
        limit: null,
        max: '21000000',
        ticker: 'PEPE',
        tx_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      });
    });
  });
});

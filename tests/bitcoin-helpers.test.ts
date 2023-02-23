import { getTransactionInscriptions } from '../src/bitcoin/helpers';
import { Transaction } from '../src/bitcoin/types';

describe('Bitcoin helpers', () => {
  test('decodes inscriptions from witness data', () => {
    const tx: Transaction = {
      txid: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dc',
      hash: '2b40630a97dc1aee6944b5181fd9d9b601575d2af8c3391369a8b1c303db12a6',
      vin: [
        {
          txid: '2c08b6b7786b6d3250a2fabe3b130a20e3754d618e9b2aaf03915f59a18c7ecd',
          vout: 0,
          scriptSig: {
            asm: '',
            hex: '',
          },
          txinwitness: [
            'e3216c849b378a3d6d6f2fbc2e1b533a9479370b2abcb6062d07b43f1710c6b9d2494d200c331c7231e080be7ce503ae1b998053e09e589ea3fdad1d777de542',
            '20a1bf72f7e7488bc82b02a901718026d6fca8eeb547f5e71455c28e39d7b4273bac0063036f7264010109696d6167652f706e67004cd089504e470d0a1a0a0000000d4948445200000018000000180806000000e0773df8000000974944415478da63601824e03f0e9a6a86e3c283df82ff44e0c16b01d880db1b1bc018d9502c62e4590033e8f9e995700361626896906f01cc705c982a3e18fa162ccbd3016364836162e45a80e1ca4b7313b08a51c5025a04d17fbac4c1cc9a485c0652cf026c96c030488e2a16e0c354b540439a138ea962012c1868e603e4b0a6b6e158331bd52b9bfbf7efc331b52b7a5c3e201900007f26d59065727fac0000000049454e44ae42608268',
            'c1a1bf72f7e7488bc82b02a901718026d6fca8eeb547f5e71455c28e39d7b4273b',
          ],
          sequence: 4294967293,
        },
      ],
      vout: [
        {
          value: 0.0001,
          n: 0,
          scriptPubKey: {
            asm: '1 8e086a655745e9177ac13619b3c2b6b651d2a194725dec5406830df7f0e63c6a',
            desc: 'rawtr(8e086a655745e9177ac13619b3c2b6b651d2a194725dec5406830df7f0e63c6a)#2tvn0chr',
            hex: '51208e086a655745e9177ac13619b3c2b6b651d2a194725dec5406830df7f0e63c6a',
            address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
            type: 'witness_v1_taproot',
          },
        },
      ],
    };
    const inscriptions = getTransactionInscriptions(tx);
    expect(inscriptions.length).toBe(1);
    expect(inscriptions[0].index).toBe(0);
    expect(inscriptions[0].contentType).toBe('image/png');
    expect(inscriptions[0].content).not.toBeUndefined();
  });

  test('ignores tx with no inscriptions', () => {
    const tx: Transaction = {
      txid: 'd9316a8cf1c2cbf28f5d1ba4c59f5839a4a623a2fa4e432809da804b823fb092',
      hash: 'cb35e4142733e612c0945268a1a47d3a2c422f1c10829768c64f772b63051e88',
      vin: [
        {
          txid: '4648dfae530fde0ec6d5d4673761e0285ca5291c52af5a1cb9188979487f08d6',
          vout: 1,
          scriptSig: {
            asm: '',
            hex: '',
          },
          txinwitness: [
            '304402206cc1e3db22e7020afc3e4d2e36f07bcfb5625d4b1d38903927b087f8948555230220201e7cbdf7f6e4bd1c1663a57849aa33e5242934c97f8c4737dfac9d40f1d8c501',
            '02f74289e5b9351ae78548f85fb6da8d6a3ea9e4ecca63d64bca7fdb8f371089a0',
          ],
          sequence: 4294967291,
        },
        {
          txid: '46c8d75ca0f1ec63d621edf0c71fdfabb52a50850bc46cfad3045db457ef6018',
          vout: 1,
          scriptSig: {
            asm: '',
            hex: '',
          },
          txinwitness: [
            '3045022100a99eac045e41c17d2181364d077fbdcf1b89594aeddefdb9bdd371d9cbf516ee02203485f833d1df8cf896bd83a3c4116bc7ab8fc522c49b12a5f91062ba8c798e5c01',
            '02f74289e5b9351ae78548f85fb6da8d6a3ea9e4ecca63d64bca7fdb8f371089a0',
          ],
          sequence: 4294967292,
        },
        {
          txid: 'ec19310b5f61344a6912671109f7bbc7188337ab50999d1f6f5d2fef79627a63',
          vout: 1,
          scriptSig: {
            asm: '',
            hex: '',
          },
          txinwitness: [
            '304402203d862d5c58998fe0e0c071401b08068e5efba985a16bed6256850c81e3814397022033c39cc260582d43b2d44d962b7217de24b82d397dbd636cfe5b50d42e397d1101',
            '02f74289e5b9351ae78548f85fb6da8d6a3ea9e4ecca63d64bca7fdb8f371089a0',
          ],
          sequence: 4294967290,
        },
      ],
      vout: [
        {
          value: 0.02040468,
          n: 0,
          scriptPubKey: {
            asm: '0 259fdb0351dec029e23e616c1f677f63ea61ec39f3b76b851ee3c5b3ac4028ce',
            desc: 'addr(bc1qyk0akq63mmqznc37v9kp7emlv04xrmpe7wmkhpg7u0zm8tzq9r8qypkj9s)#cjt2u74q',
            hex: '0020259fdb0351dec029e23e616c1f677f63ea61ec39f3b76b851ee3c5b3ac4028ce',
            address: 'bc1qyk0akq63mmqznc37v9kp7emlv04xrmpe7wmkhpg7u0zm8tzq9r8qypkj9s',
            type: 'witness_v0_scripthash',
          },
        },
        {
          value: 0.00003218,
          n: 1,
          scriptPubKey: {
            asm: '0 203db1e492ce37f958ac0ea907de042ca52bc0f5',
            desc: 'addr(bc1qyq7mreyjecmljk9vp65s0hsy9jjjhs84xadq7z)#ml448dfu',
            hex: '0014203db1e492ce37f958ac0ea907de042ca52bc0f5',
            address: 'bc1qyq7mreyjecmljk9vp65s0hsy9jjjhs84xadq7z',
            type: 'witness_v0_keyhash',
          },
        },
      ],
    };
    const inscriptions = getTransactionInscriptions(tx);
    expect(inscriptions.length).toBe(0);
  });
});

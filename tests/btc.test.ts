import { MockAgent, setGlobalDispatcher } from 'undici';
import { buildApiServer } from '../src/api/init';
import { getAddressInfo } from '../src/api/util';
import { ENV } from '../src/env';
import { TestFastifyServer } from './helpers';

describe('BTC API', () => {
  let api: TestFastifyServer;

  beforeEach(async () => {
    api = await buildApiServer();
    api.listen({ host: '0.0.0.0', port: 3000 }, (err: any, address: any) => {
      if (err) {
        api.log.error(err);
      }
    });
  });

  afterEach(async () => {
    await api.close();
  });

  test('/address/:address', async () => {
    const address = 'SP3V45J4VA0ZT4JNFJ42S801PHP2P9XDJMTYR6WF8';
    const query = await api.inject({
      method: 'GET',
      url: `/address/${address}`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      stacks: 'SP3V45J4VA0ZT4JNFJ42S801PHP2P9XDJMTYR6WF8',
      bitcoin: '1PT7EQ4LBwufZ415omMgYeXSGAMhiz5kKC',
      network: 'mainnet',
    });
  });

  test('/miner-participants/:block by hash', async () => {
    const blockHash = '0x384b6c3cd901001e5b0e556e4303879fce8f3b38f4bcb2e72c6d1198130a3d2e';
    const query = await api.inject({
      method: 'GET',
      url: `/miner-participants/${blockHash}`,
    });
    expect(JSON.parse(query.body)).toEqual({
      winner: 'SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM',
      participants: [
        {
          btcTx: '718a948cc79361632be32573309f0c9d1edabba703db23f110d36f43342e8c8f',
          stxAddress: 'SP34NSEPC85QQAZ35S51FKDNRM803HEDH56VS0XES',
          btcAddress: '1KMhuXgUsTy2XW1xDyeKGEPYQtcYpht3JJ',
        },
        {
          btcTx: 'd6ef5b13525d4344a64539350f4ef551b748b6ec347a4642b5c0248a55a10094',
          stxAddress: 'SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM',
          btcAddress: '1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
        },
        {
          btcTx: '8d75722b6a95a7dbc5d2c3e9cca8a434d6f1b4040af6f53f07bee6b80dfce9e3',
          stxAddress: 'SP2X33H8HACBWSF6HHBEWKGMZC7KPWEP2GNK28XVV',
          btcAddress: '1HyWJkJAJ8FmzpBiNPg5ToBsQAp3SCDazx',
        },
        {
          btcTx: '06991da8f37e811f5eb2ce76d9124e31daa0962f63bcdf67897ddf56636f1628',
          stxAddress: 'SP2CKVQXCKD8T0T5MXEC3MM9F23CXA14TX5MVACG6',
          btcAddress: '1EyGWQu156JwYu7fnoMws2NzjAoBt8Lrzj',
        },
        {
          btcTx: '271cbcd81ec20ea81be56e7b7ecfc02c78e968c18bd1299a73f87ed0122f3f8c',
          stxAddress: 'SP2DA2AF7VYR6XCDRG7V8P97YJZPH4521TVS9VE5Q',
          btcAddress: '1F6c8PicZVmxWQQV2Y2adeGvxSeFtewTDj',
        },
      ],
    });
  });

  test('/miner-participants/:block by height', async () => {
    const blockHeight = 86286;
    const query = await api.inject({
      method: 'GET',
      url: `/miner-participants/${blockHeight}`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      winner: 'SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM',
      participants: [
        {
          btcTx: '718a948cc79361632be32573309f0c9d1edabba703db23f110d36f43342e8c8f',
          stxAddress: 'SP34NSEPC85QQAZ35S51FKDNRM803HEDH56VS0XES',
          btcAddress: '1KMhuXgUsTy2XW1xDyeKGEPYQtcYpht3JJ',
        },
        {
          btcTx: 'd6ef5b13525d4344a64539350f4ef551b748b6ec347a4642b5c0248a55a10094',
          stxAddress: 'SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM',
          btcAddress: '1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
        },
        {
          btcTx: '8d75722b6a95a7dbc5d2c3e9cca8a434d6f1b4040af6f53f07bee6b80dfce9e3',
          stxAddress: 'SP2X33H8HACBWSF6HHBEWKGMZC7KPWEP2GNK28XVV',
          btcAddress: '1HyWJkJAJ8FmzpBiNPg5ToBsQAp3SCDazx',
        },
        {
          btcTx: '06991da8f37e811f5eb2ce76d9124e31daa0962f63bcdf67897ddf56636f1628',
          stxAddress: 'SP2CKVQXCKD8T0T5MXEC3MM9F23CXA14TX5MVACG6',
          btcAddress: '1EyGWQu156JwYu7fnoMws2NzjAoBt8Lrzj',
        },
        {
          btcTx: '271cbcd81ec20ea81be56e7b7ecfc02c78e968c18bd1299a73f87ed0122f3f8c',
          stxAddress: 'SP2DA2AF7VYR6XCDRG7V8P97YJZPH4521TVS9VE5Q',
          btcAddress: '1F6c8PicZVmxWQQV2Y2adeGvxSeFtewTDj',
        },
      ],
    });
  });

  test('/btc-block-stx-ops/:block', async () => {
    const btcBlockHash = '00000000000000000001d1a673ba954c896c922eea686496820f3305e88c27dd';
    const query = await api.inject({
      method: 'GET',
      url: `/btc-block-stx-ops/${btcBlockHash}`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      bitcoinBlockHash: '00000000000000000001d1a673ba954c896c922eea686496820f3305e88c27dd',
      bitcoinBlockHeight: 767163,
      leaderBlockCommits: [
        {
          address: '1Di1YoMov6Ua3gPedfQz7TkP6iTLqbPUzi',
          blockHash: '515945ec9045684926d3b1841a4cf199e02fada3115cced72b22fa9012373a43',
          burnParentModulus: 42,
          keyBlock: 765083,
          keyTxOffset: 212,
          newSeed: 'bf18661444f32ed4f5d9db79410815435e124698e7140148e977e85dcdd30323',
          parentBlock: 767162,
          parentTxOffset: 87,
          stxAddress: 'SP25P61C1DJ3P4TMTRJWQ5HE3ESK3PBTXS1EKYT43',
          txid: 'a60f1be0046b7f4373d51380ba6b49378178c0e95c77f7c51a91212743a9ba7e',
        },
        {
          address: '1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
          blockHash: '9bbecef36046b3ae5ac5b4ce6ac8d9736f64b3fe75a65076e197c611dcbcf78a',
          burnParentModulus: 42,
          keyBlock: 765457,
          keyTxOffset: 465,
          newSeed: 'c4a83b046ef383b0997c52058b3bd369f1f98b5e37cf93953bf3deaa58383943',
          parentBlock: 767162,
          parentTxOffset: 87,
          stxAddress: 'SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM',
          txid: '99eb4f3b08311cf509bae592f9572454f9d66312318ce418d904515e67cc7434',
        },
        {
          address: '1HyWJkJAJ8FmzpBiNPg5ToBsQAp3SCDazx',
          blockHash: '599786228e22ac0acc5bdd7e4caa66e89cc54007f1184206e627269f9ed1a613',
          burnParentModulus: 42,
          keyBlock: 765864,
          keyTxOffset: 532,
          newSeed: '612674c4fb623bac63a13b7cfa7d7bee27639e4e2d79f391ce6ca902394d4d4a',
          parentBlock: 767162,
          parentTxOffset: 87,
          stxAddress: 'SP2X33H8HACBWSF6HHBEWKGMZC7KPWEP2GNK28XVV',
          txid: 'f628a5078c16e970d6927dc7db76207c40d40d2581899c745ce3b7da9a300b40',
        },
        {
          address: '1EyGWQu156JwYu7fnoMws2NzjAoBt8Lrzj',
          blockHash: '250aea35084c7415cd23cec82149460740fa2719cdeca9a47d20b969e96d81d0',
          burnParentModulus: 42,
          keyBlock: 765322,
          keyTxOffset: 2399,
          newSeed: '851bcff7a67afa55a127d8a7f9f55fca3359c488e8fae105f07898fd99bd811e',
          parentBlock: 767162,
          parentTxOffset: 87,
          stxAddress: 'SP2CKVQXCKD8T0T5MXEC3MM9F23CXA14TX5MVACG6',
          txid: '7759f4eae05ba9a0d45504c2e25e7487fe3efb0d8dbcbd331eec5572c472b211',
        },
        {
          address: '1F6c8PicZVmxWQQV2Y2adeGvxSeFtewTDj',
          blockHash: 'fdfccf27225d122a059d730a7ff6c61149824c33f444a43c2223ee9daaa90e6b',
          burnParentModulus: 42,
          keyBlock: 765202,
          keyTxOffset: 1389,
          newSeed: '5cf3034d1e4391905d2de42453c258009f1b760d70e5048a53f9df6a85c6a21d',
          parentBlock: 767162,
          parentTxOffset: 87,
          stxAddress: 'SP2DA2AF7VYR6XCDRG7V8P97YJZPH4521TVS9VE5Q',
          txid: 'ef0bc36b2d84dd4d8c57771180aeea06fab62d2a0a03ddf49779a21ffbe2c712',
        },
      ],
      leaderVrfKeyRegistrations: [],
      stxTransfers: [],
    });
  });

  test('/btc-info-from-stx-tx/:txid', async () => {
    const txId = '0xccc0dd66ad3b2715f2dd74836bc8428a286bdb8df597e158a381c2162d194ae2';
    const query = await api.inject({
      method: 'GET',
      url: `/btc-info-from-stx-tx/${txId}`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      bitcoinBlockExplorer:
        'https://www.blockchain.com/btc/block/000000000000000000011a772694d5011ca8dbbfdd453081116942c8c4cb9293',
      bitcoinBlockHash: '000000000000000000011a772694d5011ca8dbbfdd453081116942c8c4cb9293',
      bitcoinTx: 'eb12ad6768a49673bdcad7c4edb0c05b328b42e56432c7176b756367ec7ea95d',
      bitcoinTxExplorer:
        'https://www.blockchain.com/btc/tx/eb12ad6768a49673bdcad7c4edb0c05b328b42e56432c7176b756367ec7ea95d',
      minerBtcAddress: '1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
      minerBtcAddressExplorer:
        'https://www.blockchain.com/btc/address/1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
      minerStxAddress: 'SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM',
      minerStxAddressExplorer:
        'https://explorer.stacks.co/address/SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM?chain=mainnet',
      stacksBlockExplorer:
        'https://explorer.stacks.co/block/0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd?chain=mainnet',
      stacksBlockHash: '0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd',
      stacksTx: '0xccc0dd66ad3b2715f2dd74836bc8428a286bdb8df597e158a381c2162d194ae2',
      stacksTxExplorer:
        'https://explorer.stacks.co/txid/0xccc0dd66ad3b2715f2dd74836bc8428a286bdb8df597e158a381c2162d194ae2?chain=mainnet',
    });
  });

  test('/btc-info-from-stx-block/:block by hash', async () => {
    const blockHash = '0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd';
    const query = await api.inject({
      method: 'GET',
      url: `/btc-info-from-stx-block/${blockHash}`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      bitcoinBlockExplorer:
        'https://www.blockchain.com/btc/block/000000000000000000011a772694d5011ca8dbbfdd453081116942c8c4cb9293',
      bitcoinBlockHash: '000000000000000000011a772694d5011ca8dbbfdd453081116942c8c4cb9293',
      bitcoinTx: 'eb12ad6768a49673bdcad7c4edb0c05b328b42e56432c7176b756367ec7ea95d',
      bitcoinTxExplorer:
        'https://www.blockchain.com/btc/tx/eb12ad6768a49673bdcad7c4edb0c05b328b42e56432c7176b756367ec7ea95d',
      minerBtcAddress: '1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
      minerBtcAddressExplorer:
        'https://www.blockchain.com/btc/address/1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
      minerStxAddress: 'SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM',
      minerStxAddressExplorer:
        'https://explorer.stacks.co/address/SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM?chain=mainnet',
      stacksBlockExplorer:
        'https://explorer.stacks.co/block/0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd?chain=mainnet',
      stacksBlockHash: '0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd',
    });
  });

  test('/btc-info-from-stx-block/:block by height', async () => {
    const blockHeight = 86969;
    const query = await api.inject({
      method: 'GET',
      url: `/btc-info-from-stx-block/${blockHeight}`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      bitcoinBlockExplorer:
        'https://www.blockchain.com/btc/block/000000000000000000011a772694d5011ca8dbbfdd453081116942c8c4cb9293',
      bitcoinBlockHash: '000000000000000000011a772694d5011ca8dbbfdd453081116942c8c4cb9293',
      bitcoinTx: 'eb12ad6768a49673bdcad7c4edb0c05b328b42e56432c7176b756367ec7ea95d',
      bitcoinTxExplorer:
        'https://www.blockchain.com/btc/tx/eb12ad6768a49673bdcad7c4edb0c05b328b42e56432c7176b756367ec7ea95d',
      minerBtcAddress: '1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
      minerBtcAddressExplorer:
        'https://www.blockchain.com/btc/address/1BVnHssMpsdJtuHsbcDQSL1gPNENNmSGcT',
      minerStxAddress: 'SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM',
      minerStxAddressExplorer:
        'https://explorer.stacks.co/address/SP1SJ5DHQ0AWMTD8V20WPN03AHH6F1VXDTMPM1AVM?chain=mainnet',
      stacksBlockExplorer:
        'https://explorer.stacks.co/block/0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd?chain=mainnet',
      stacksBlockHash: '0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd',
    });
  });

  test('/stx-block by hash', async () => {
    const btcBlockHash = '000000000000000000011a772694d5011ca8dbbfdd453081116942c8c4cb9293';

    const query = await api.inject({
      method: 'GET',
      url: `/stx-block?btc-block=${btcBlockHash}`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      hash: '0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd',
      height: 86969,
      parent_block_hash: '0x9626d60170e11f0fabc2cca23c3e150aafbb741671a857d45000f39ab95110a2',
    });
  });

  test('/stx-block by height', async () => {
    const btcBlockHeight = 767169;

    const query = await api.inject({
      method: 'GET',
      url: `/stx-block?btc-block=${btcBlockHeight}`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      hash: '0x2278b2d2519b78243a731038fec83b98a938167834811fa9b78b2e0f94a5b7dd',
      height: 86969,
      parent_block_hash: '0x9626d60170e11f0fabc2cca23c3e150aafbb741671a857d45000f39ab95110a2',
    });
  });

  test('/address/:address/balances', async () => {
    const address = 'SP3RQXM3QDHKTZAZFFCMA8J3ZE6EZ42N8KR26WNPX';
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(ENV.STACKS_API_ENDPOINT)
      .intercept({
        path: `/extended/v1/address/${address}/balances`,
        method: 'GET',
      })
      .reply(200, {
        stx: {
          balance: '2459460274',
          total_sent: '12770289123',
          total_received: '15329265818',
          total_fees_sent: '99516421',
          total_miner_rewards_received: '0',
          lock_tx_id: '0xf744e6e3882fc56ff6b80fb1fbfd87baafada561ce4a7e34caa3dad70971fb1e',
          locked: '1000000000',
          lock_height: 77537,
          burnchain_lock_height: 756158,
          burnchain_unlock_height: 768950,
        },
        fungible_tokens: {
          'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2::miamicoin': {
            balance: '12',
            total_sent: '86003235910',
            total_received: '86003235922',
          },
          'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-swap-token-wstx-diko::wstx-diko': {
            balance: '0',
            total_sent: '215927384',
            total_received: '215927384',
          },
          'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token::diko': {
            balance: '785082514',
            total_sent: '2102237901',
            total_received: '2887320415',
          },
          'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.stdiko-token::stdiko': {
            balance: '541172910',
            total_sent: '0',
            total_received: '541172910',
          },
          'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token::usda': {
            balance: '1372057',
            total_sent: '249808132',
            total_received: '251180189',
          },
          'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.wrapped-stx-token::wstx': {
            balance: '0',
            total_sent: '199873605',
            total_received: '199873605',
          },
          'SP2TZK01NKDC89J6TA56SA47SDF7RTHYEQ79AAB9A.Wrapped-USD::wrapped-usd': {
            balance: '1',
            total_sent: '15538964965',
            total_received: '15538964966',
          },
          'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.Wrapped-Bitcoin::wrapped-bitcoin': {
            balance: '423986',
            total_sent: '503484',
            total_received: '927470',
          },
          'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.age000-governance-token::alex': {
            balance: '220380214',
            total_sent: '5525568684855',
            total_received: '5525789065069',
          },
          'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.auto-alex::auto-alex': {
            balance: '1101308993800',
            total_sent: '100000000000',
            total_received: '1201308993800',
          },
          'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fwp-alex-usda::fwp-alex-usda': {
            balance: '0',
            total_sent: '78736595867',
            total_received: '78736595867',
          },
          'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fwp-wstx-alex-50-50-v1-01::fwp-wstx-alex-50-50-v1-01':
            {
              balance: '0',
              total_sent: '752517229441',
              total_received: '752517229441',
            },
          'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fwp-wstx-wbtc-50-50-v1-01::fwp-wstx-wbtc-50-50-v1-01':
            {
              balance: '0',
              total_sent: '208663650',
              total_received: '208663650',
            },
          'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fwp-wstx-wmia-50-50-v1-01::fwp-wstx-wmia-50-50-v1-01':
            {
              balance: '348028665836',
              total_sent: '0',
              total_received: '348028665836',
            },
          'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fwp-wstx-wxusd-50-50-v1-01::fwp-wstx-wxusd-50-50-v1-01':
            {
              balance: '0',
              total_sent: '27086000040',
              total_received: '27086000040',
            },
          'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-apower::apower': {
            balance: '430393390960',
            total_sent: '0',
            total_received: '430393390960',
          },
          'SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token::miamicoin': {
            balance: '14478',
            total_sent: '1',
            total_received: '14479',
          },
        },
        non_fungible_tokens: {},
      });

    const addrInfo = getAddressInfo(address);
    agent
      .get(ENV.BLOCKCHAIN_INFO_API_ENDPOINT)
      .intercept({
        path: `/rawaddr/${addrInfo.bitcoin}?limit=0`,
        method: 'GET',
      })
      .reply(200, {
        hash160: 'f17ed0776c67afabef7b28a4487f719df20aa89e',
        address: '1P1umSo1kV98aYDacxXNG69pYmxzyFvcyK',
        n_tx: 0,
        n_unredeemed: 0,
        total_received: 0,
        total_sent: 0,
        final_balance: 0,
        txs: [],
      });
    setGlobalDispatcher(agent);

    const query = await api.inject({
      method: 'GET',
      url: `/address/${address}/balances`,
    });
    expect(query.statusCode).toBe(200);
    expect(JSON.parse(query.body)).toEqual({
      stacks: {
        address: 'SP3RQXM3QDHKTZAZFFCMA8J3ZE6EZ42N8KR26WNPX',
        balance: '2459.460274',
      },
      bitcoin: {
        address: '1P1umSo1kV98aYDacxXNG69pYmxzyFvcyK',
        balance: '0.00000000',
      },
    });
    await agent.close();
  });
});

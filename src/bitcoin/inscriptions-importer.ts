import { logger } from '../logger';
import { PgStore } from '../pg/pg-store';
import { BitcoinRpcClient } from './bitcoin-rpc-client';
import { btcToSats, findVinInscriptionGenesis } from './helpers';
import { Block, Transaction } from './types';

/** First mainnet block height with inscriptions (original 767430) */
const FIRST_INSCRIPTION_BLOCK_HEIGHT = 767430;

/**
 * xc
 */
export class InscriptionsImporter {
  private readonly db: PgStore;
  private readonly startingBlockHeight: number;
  private readonly client: BitcoinRpcClient;

  constructor(args: { db: PgStore; startingBlockHeight: number }) {
    this.db = args.db;
    this.startingBlockHeight = args.startingBlockHeight;
    this.client = new BitcoinRpcClient();
  }

  async import() {
    const startHeight = Math.max(this.startingBlockHeight, FIRST_INSCRIPTION_BLOCK_HEIGHT);
    logger.info(`InscriptionsImporter starting at height ${startHeight}...`);
    const startBlockHash = await this.client.getBlockHash({ height: startHeight });

    let nextBlockHash = startBlockHash;
    while (true) {
      const block = await this.client.getBlock({ hash: nextBlockHash });
      await this.scanBlock(block);
      await this.db.updateChainTipBlockHeight({ blockHeight: block.height + 1 });
      if (!block.nextblockhash) break;
      nextBlockHash = block.nextblockhash;
    }
  }

  async close() {
    //
  }

  private async scanBlock(block: Block) {
    logger.info(`InscriptionsImporter scanning for inscriptions at block ${block.height}`);
    // Skip coinbase tx.
    for (const txId of block.tx.slice(1)) {
      const tx = await this.client.getTransaction({ txId, blockHash: block.hash });
      let txFee: bigint | undefined;

      let genesisIndex = 0;
      let offset = 0n;
      for (const vin of tx.vin) {
        // Does this UTXO have a new inscription?
        const genesis = findVinInscriptionGenesis(vin);
        if (genesis) {
          txFee = txFee ?? (await this.getTransactionFee(tx));
          const genesisId = `${tx.txid}i${genesisIndex++}`;
          const res = await this.db.insertInscriptionGenesis({
            inscription: {
              genesis_id: genesisId,
              number: 1,
              mime_type: genesis.contentType.split(';')[0],
              content_type: genesis.contentType,
              content_length: genesis.content.byteLength,
              content: genesis.content,
              fee: txFee,
            },
            location: {
              inscription_id: 0, // TBD once inscription insert is done
              block_height: block.height,
              block_hash: block.hash,
              tx_id: tx.txid,
              address: tx.vout[0].scriptPubKey.address,
              output: `${tx.txid}:0`,
              offset: 0n,
              value: btcToSats(tx.vout[0].value),
              timestamp: block.time,
              sat_ordinal: 257418248345364n,
              sat_rarity: 'common',
              genesis: true,
              current: true,
            },
          });
          logger.info(
            `InscriptionsImporter found genesis #${res.inscription.number}: ${genesisId}`
          );
          continue;
        }
        // Is it a UTXO that previously held an inscription?
        const prevLocation = await this.db.getInscriptionCurrentLocation({
          output: `${vin.txid}:${vin.vout}`,
        });
        if (prevLocation) {
          for (const vout of tx.vout) {
            // TODO: Is this the right address to take?
            if (vout.scriptPubKey.address) {
              await this.db.updateInscriptionLocation({
                location: {
                  inscription_id: prevLocation.inscription_id,
                  block_height: block.height,
                  block_hash: block.hash,
                  tx_id: tx.txid,
                  address: vout.scriptPubKey.address,
                  output: `${tx.txid}:0`,
                  offset: offset,
                  value: btcToSats(vout.value),
                  timestamp: block.time,
                  sat_ordinal: 257418248345364n,
                  sat_rarity: 'common',
                  genesis: false,
                  current: true,
                },
              });
              offset += prevLocation.value;
              break;
            }
          }
        }
      }
    }
  }

  private async getTransactionFee(tx: Transaction): Promise<bigint> {
    let totalIn = 0.0;
    // TODO: Do these in parallel? How much can bitcoin RPC hold?
    for (const vin of tx.vin) {
      const inTx = await this.client.getTransaction({ txId: vin.txid });
      totalIn += inTx.vout[vin.vout].value;
    }
    let totalOut = 0.0;
    for (const vout of tx.vout) {
      totalOut += vout.value;
    }
    return btcToSats(totalIn - totalOut);
  }
}

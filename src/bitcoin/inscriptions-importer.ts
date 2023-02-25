import { logger } from '../logger';
import { PgStore } from '../pg/pg-store';
import { BitcoinRpcClient } from './bitcoin-rpc-client';
import { findVinGenesisInscription } from './helpers';
// import { getTransactionInscriptions } from './helpers';
import { Block } from './types';

/** First mainnet block height with inscriptions */
const STARTING_BLOCK_HEIGHT = 767430;

/**
 * xc
 */
export class InscriptionsImporter {
  private readonly db: PgStore;
  private readonly client: BitcoinRpcClient;

  constructor(args: { db: PgStore }) {
    this.db = args.db;
    this.client = new BitcoinRpcClient();
  }

  async import() {
    logger.info(`InscriptionsImporter starting at height ${STARTING_BLOCK_HEIGHT}...`);
    const startBlockHash = await this.client.getBlockHash({ height: STARTING_BLOCK_HEIGHT });

    let nextBlockHash = startBlockHash;
    while (true) {
      const block = await this.client.getBlock({ hash: nextBlockHash });
      await this.scanBlock(block);
      if (!block.nextblockhash) break;
      nextBlockHash = block.nextblockhash;
    }
  }

  async close() {
    //
  }

  private async scanBlock(block: Block) {
    logger.info(`InscriptionsImporter scanning for inscriptions at block ${block.height}`);
    // Skip coinbase tx, process all others to track inscription flow.
    for (const txId of block.tx.slice(1)) {
      const tx = await this.client.getTransaction({ txId, blockHash: block.hash });
      for (const vin of tx.vin) {
        // Does this UTXO have a new inscription?
        const genesis = findVinGenesisInscription(tx, vin);
        if (genesis) {
          // insert
          continue;
        }
        // Is it a UTXO that previously held an inscription?
        const prevInscription = await this.db.getInscriptionByUtxo(`${vin.txid}:${vin.vout}`);
        // insert new record
      }
    }
  }
}

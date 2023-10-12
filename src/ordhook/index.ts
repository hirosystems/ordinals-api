import { OrdinalsIndexer } from '@hirosystems/ordhook-sdk-js';
import { ENV } from '../env';
import { PgStore } from '../pg/pg-store';
import { BitcoinEvent } from '@hirosystems/chainhook-client';
import Queue from 'queue';

export interface OrdhookBlock {
  block: BitcoinEvent;
}

export function buildOrdhookIndexer(jobQueue: Queue, db: PgStore): OrdinalsIndexer {
  const ordhook = new OrdinalsIndexer({
    bitcoinRpcUrl: ENV.BITCOIN_RPC_URL,
    bitcoinRpcUsername: ENV.BITCOIN_RPC_USERNAME,
    bitcoinRpcPassword: ENV.BITCOIN_RPC_PASSWORD,
    workingDirectory: ENV.ORDHOOK_WORKING_DIR,
    logs: true,
  });
  ordhook.onBlock(block => {
    console.log(`Queue size: ${jobQueue.length}`);

    // Early return: if the queue is full, reject the block
    if (jobQueue.length > 10) {
      console.log('Blocking');
      return false;
    }

    // Enqueue
    jobQueue.push(async () => {
      await db.insertBlock(block as OrdhookBlock);
    });
    return true;
  });

  ordhook.onBlockRollBack(block => {
    console.log(`Queue size: ${jobQueue.length}`);

    // Early return: if the queue is full, reject the block
    if (jobQueue.length > 10) {
      console.log('Blocking');
      return false;
    }

    // Enqueue
    jobQueue.push(async () => {
      await db.rollBackBlock(block as OrdhookBlock);
    });
    return true;
  });
  return ordhook;
}

import { OrdinalsIndexer } from '@hirosystems/ordhook-sdk-js';
import { ENV } from '../env';
import { PgStore } from '../pg/pg-store';
import { BitcoinEvent } from '@hirosystems/chainhook-client';

export interface OrdhookBlock {
  block: BitcoinEvent;
}

export function buildOrdhookIndexer(args: { db: PgStore }): OrdinalsIndexer {
  const ordhook = new OrdinalsIndexer({
    bitcoinRpcUrl: ENV.BITCOIN_RPC_URL,
    bitcoinRpcUsername: ENV.BITCOIN_RPC_USERNAME,
    bitcoinRpcPassword: ENV.BITCOIN_RPC_PASSWORD,
    workingDirectory: ENV.ORDHOOK_WORKING_DIR,
    logs: true,
  });
  ordhook.onBlock(async block => {
    await args.db.insertBlock(block as OrdhookBlock);
  });
  ordhook.onBlockRollBack(async block => {
    await args.db.rollBackBlock(block as OrdhookBlock);
  });
  return ordhook;
}

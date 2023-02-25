import * as bitcoin from 'bitcoinjs-lib';
import { hexToBuffer } from '../api/util/helpers';
import { DbInscriptionInsert } from '../pg/types';
import { BitcoinRpcClient } from './bitcoin-rpc-client';
import { Block, Transaction, TransactionVin } from './types';

type VinInscription = {
  contentType: string;
  content: Buffer;
};

export function findVinInscriptionGenesis(vin: TransactionVin): VinInscription | undefined {
  for (const witness of vin.txinwitness) {
    const script = bitcoin.script.decompile(hexToBuffer(`0x${witness}`));
    if (!script) continue;
    const payload = script.slice(2);
    if (!payload.length) continue;

    let i = 0;
    if (payload[i++] !== bitcoin.opcodes.OP_FALSE) continue;
    if (payload[i++] !== bitcoin.opcodes.OP_IF) continue;
    if (payload[i++].toString() !== 'ord') continue;
    if (payload[i++] !== bitcoin.opcodes.OP_1) continue;
    const contentType = payload[i++].toString();
    if (payload[i++] !== bitcoin.opcodes.OP_0) continue;
    const content = payload[i++] as Buffer;
    if (payload[i++] !== bitcoin.opcodes.OP_ENDIF) continue;

    return {
      contentType,
      content,
    };
  }
}

export async function getTransactionFee(
  client: BitcoinRpcClient,
  tx: Transaction
): Promise<number> {
  let totalIn = 0.0;
  // TODO: Do these in parallel?
  for (const vin of tx.vin) {
    const inTx = await client.getTransaction({ txId: vin.txid });
    totalIn += inTx.vout[vin.vout].value;
  }
  let totalOut = 0.0;
  for (const vout of tx.vout) {
    totalOut += vout.value;
  }
  return totalOut - totalIn;
}

// export function getInsertableInscriptions(tx: Transaction, block: Block): DbInscriptionInsert[] {
//   const inscriptions = getTransactionInscriptions(tx);
//   if (!inscriptions.length) return [];

//   const inserts: DbInscriptionInsert[] = [];
//   for (const inscription of inscriptions) {
//     inserts.push({
//       inscription_id: `0x${tx.hash}i${inscription.index}`,
//       offset: inscription.index,
//       block_height: block.height,
//       block_hash: `0x${block.hash}`,
//       tx_id: `0x${tx.hash}`,
//       address: inscription.address,
//       sat_ordinal: 0,
//       sat_point: `${tx.hash}:0:0`,
//       sat_rarity: '',
//       fee: 0,
//       mime_type: inscription.contentType.split(';')[0],
//       content_type: inscription.contentType,
//       content_length: inscription.content.byteLength,
//       content: inscription.content,
//       timestamp: block.time,
//     });
//   }
//   return inserts;
// }

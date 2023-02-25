import * as bitcoin from 'bitcoinjs-lib';
import { hexToBuffer } from '../api/util/helpers';
import { TransactionVin } from './types';

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

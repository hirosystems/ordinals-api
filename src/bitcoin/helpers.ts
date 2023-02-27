import * as bitcoin from 'bitcoinjs-lib';
import { TransactionVin } from './types';

type VinInscription = {
  contentType: string;
  content: Buffer;
};

export function findVinInscriptionGenesis(vin: TransactionVin): VinInscription | undefined {
  if (!vin.txinwitness) return;
  for (const witness of vin.txinwitness) {
    const script = bitcoin.script.decompile(Buffer.from(witness, 'hex'));
    if (!script) continue;

    while (script.length && script[0] !== bitcoin.opcodes.OP_FALSE) {
      script.shift();
    }
    script.shift();
    if (script.shift() !== bitcoin.opcodes.OP_IF) continue;
    if (script.shift()?.toString() !== 'ord') continue;
    if (script.shift() !== bitcoin.opcodes.OP_1) continue;
    const contentType = script.shift()?.toString();
    if (!contentType) continue;
    if (script.shift() !== bitcoin.opcodes.OP_0) continue;

    let content: Buffer | undefined;
    do {
      const next = script.shift();
      if (!next || next === bitcoin.opcodes.OP_ENDIF) break;
      content = !content ? (next as Buffer) : Buffer.concat([content, next as Buffer]);
    } while (true);
    if (!content) continue;

    return {
      contentType,
      content,
    };
  }
}

export function btcToSats(btc: number): bigint {
  return BigInt(Math.round(btc * Math.pow(10, 8)));
}

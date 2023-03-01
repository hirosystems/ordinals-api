import { OrdinalSatoshi } from '../api/util/ordinal-satoshi';
import { PgStore } from '../pg/pg-store';
import { ChainhookPayloadCType } from './types';

/**
 * Process an `inscription_revealed` event from chainhooks and saves inscriptions to the DB.
 * @param payload - Event payload
 * @param db - DB
 */
export async function processInscriptionRevealed(payload: unknown, db: PgStore): Promise<void> {
  if (!ChainhookPayloadCType.Check(payload)) return;
  for (const event of payload.apply) {
    for (const tx of event.transactions) {
      const reveal = tx.metadata.ordinal_operations[0].inscription_revealed;
      const utxo = tx.metadata.outputs[0];
      await db.insertInscriptionGenesis({
        inscription: {
          genesis_id: reveal.inscription.inscription_id,
          mime_type: reveal.inscription.content_type.split(';')[0],
          content_type: reveal.inscription.content_type,
          content_length: reveal.inscription.content_length,
          number: reveal.inscription.inscription_number,
          content: reveal.inscription.content_bytes,
          fee: BigInt(tx.fee),
        },
        location: {
          inscription_id: 0, // To be set when inserting.
          block_height: event.block_identifier.index,
          block_hash: event.block_identifier.hash.substring(2),
          tx_id: tx.transaction_identifier.hash.substring(2),
          address: reveal.inscription.address,
          output: utxo.output,
          offset: BigInt(reveal.ordinal.ordinal_offset),
          value: BigInt(utxo.value),
          timestamp: event.timestamp,
          sat_ordinal: BigInt(reveal.ordinal.ordinal_number),
          sat_rarity: new OrdinalSatoshi(reveal.ordinal.ordinal_number).rarity,
          genesis: true,
          current: true,
        },
      });
    }
  }
}

/**
 * Process an `inscription_transfer` event from chainhooks and saves new locations to the DB.
 * @param payload - Event payload
 * @param db - DB
 */
export async function processInscriptionTransferred(payload: unknown, db: PgStore): Promise<void> {
  //
}

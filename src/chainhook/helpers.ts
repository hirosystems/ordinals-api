import { OrdinalSatoshi } from '../api/util/ordinal-satoshi';
import { logger } from '../logger';
import { PgStore } from '../pg/pg-store';
import { ChainhookPayloadCType } from './schemas';

/**
 * Process an `inscription_revealed` event from chainhooks and saves inscriptions to the DB.
 * @param payload - Event payload
 * @param db - DB
 */
export async function processInscriptionRevealed(payload: unknown, db: PgStore): Promise<void> {
  if (!ChainhookPayloadCType.Check(payload)) return;
  for (const event of payload.rollback) {
    for (const tx of event.transactions) {
      const genesis_id = tx.metadata.ordinal_operations[0].inscription_revealed.inscription_id;
      await db.rollBackInscriptionGenesis({ genesis_id });
      logger.info(`[inscription_revealed] rollback inscription ${genesis_id}`);
    }
  }
  for (const event of payload.apply) {
    for (const tx of event.transactions) {
      const txId = tx.transaction_identifier.hash.substring(2);
      const reveal = tx.metadata.ordinal_operations[0].inscription_revealed;
      const utxo = tx.metadata.outputs[0];
      const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
      await db.insertInscriptionGenesis({
        inscription: {
          genesis_id: reveal.inscription_id,
          mime_type: reveal.content_type.split(';')[0],
          content_type: reveal.content_type,
          content_length: reveal.content_length,
          number: reveal.inscription_number,
          content: reveal.content_bytes,
          fee: BigInt(reveal.inscription_fee),
        },
        location: {
          inscription_id: 0, // To be set when inserting.
          block_height: event.block_identifier.index,
          block_hash: event.block_identifier.hash.substring(2),
          tx_id: txId,
          address: reveal.inscription_authors[0],
          output: `${txId}:0`,
          offset: 0n,
          value: BigInt(utxo.value),
          timestamp: event.timestamp,
          sat_ordinal: BigInt(reveal.ordinal_number),
          sat_rarity: satoshi.rarity,
          sat_coinbase_height: satoshi.blockHeight,
          genesis: true,
          current: true,
        },
      });
      logger.info(
        `[inscription_revealed] apply inscription #${reveal.inscription_number} (${reveal.inscription_id}) at block ${event.block_identifier.index}`
      );
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

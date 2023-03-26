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
  if (!ChainhookPayloadCType.Check(payload)) {
    const errors = [...ChainhookPayloadCType.Errors(payload)];
    logger.warn(errors, `[inscription_revealed] invalid payload`);
    return;
  }
  for (const event of payload.rollback) {
    for (const tx of event.transactions) {
      const reveal = tx.metadata.ordinal_operations[0].inscription_revealed;
      if (!reveal) {
        logger.warn(`[inscription_revealed] invalid rollback`);
        continue;
      }
      const genesis_id = reveal.inscription_id;
      await db.rollBackInscriptionGenesis({ genesis_id });
      logger.info(`[inscription_revealed] rollback inscription ${genesis_id}`);
    }
  }
  for (const event of payload.apply) {
    for (const tx of event.transactions) {
      const reveal = tx.metadata.ordinal_operations[0].inscription_revealed;
      if (!reveal) {
        logger.warn(`[inscription_revealed] invalid apply`);
        continue;
      }
      const txId = tx.transaction_identifier.hash.substring(2);
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
          genesis_id: reveal.inscription_id,
          block_height: event.block_identifier.index,
          block_hash: event.block_identifier.hash.substring(2),
          tx_id: txId,
          address: reveal.inscriber_address,
          output: `${txId}:0`,
          offset: BigInt(reveal.ordinal_offset),
          value: BigInt(utxo.value),
          timestamp: event.timestamp,
          sat_ordinal: BigInt(reveal.ordinal_number),
          sat_rarity: satoshi.rarity,
          sat_coinbase_height: satoshi.blockHeight,
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
  if (!ChainhookPayloadCType.Check(payload)) {
    const errors = [...ChainhookPayloadCType.Errors(payload)];
    logger.warn(errors, `[inscription_transferred] invalid payload`);
    return;
  }
  for (const event of payload.rollback) {
    for (const tx of event.transactions) {
      const transfer = tx.metadata.ordinal_operations[0].inscription_transferred;
      if (!transfer) {
        logger.warn(`[inscription_transferred] invalid rollback`);
        continue;
      }
      const genesis_id = transfer.inscription_id;
      const satpoint = transfer.satpoint_post_transfer.split(':');
      const output = `${satpoint[0]}:${satpoint[1]}`;
      await db.rollBackInscriptionTransfer({ genesis_id, output });
      logger.info(`[inscription_transferred] rollback transfer ${genesis_id} ${output}`);
    }
  }
  for (const event of payload.apply) {
    for (const tx of event.transactions) {
      const transfer = tx.metadata.ordinal_operations[0].inscription_transferred;
      if (!transfer) {
        logger.warn(`[inscription_transferred] invalid apply`);
        continue;
      }
      const txId = tx.transaction_identifier.hash.substring(2);
      const satpoint = transfer.satpoint_post_transfer.split(':');
      const output = `${satpoint[0]}:${satpoint[1]}`;
      const utxo = tx.metadata.outputs[0];
      const satoshi = new OrdinalSatoshi(transfer.ordinal_number);
      await db.insertInscriptionTransfer({
        location: {
          genesis_id: transfer.inscription_id,
          block_height: event.block_identifier.index,
          block_hash: event.block_identifier.hash,
          tx_id: txId,
          address: transfer.updated_address,
          output: output,
          offset: BigInt(satpoint[2]),
          value: BigInt(utxo.value),
          timestamp: event.timestamp,
          sat_ordinal: BigInt(transfer.ordinal_number),
          sat_rarity: satoshi.rarity,
          sat_coinbase_height: satoshi.blockHeight,
        },
      });
      logger.info(
        `[inscription_transferred] apply transfer for #${transfer.inscription_number} (${transfer.inscription_id}) to output ${output} at block ${event.block_identifier.index}`
      );
    }
  }
}

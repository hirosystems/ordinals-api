import { OrdinalSatoshi } from '../api/util/ordinal-satoshi';
import { logger } from '../logger';
import { PgStore } from '../pg/pg-store';
import { ChainhookPayloadCType } from './schemas';

/**
 * Process an `inscription_feed` event from chainhooks and saves inscription data to the DB.
 * @param payload - Event payload
 * @param db - DB
 */
export async function processInscriptionFeed(payload: unknown, db: PgStore): Promise<void> {
  if (!ChainhookPayloadCType.Check(payload)) {
    const errors = [...ChainhookPayloadCType.Errors(payload)];
    logger.error(errors, `[inscription_feed] invalid payload`);
    return;
  }
  for (const event of payload.rollback) {
    for (const tx of event.transactions) {
      for (const operation of tx.metadata.ordinal_operations) {
        if (operation.inscription_revealed) {
          const genesis_id = operation.inscription_revealed.inscription_id;
          await db.rollBackInscriptionGenesis({ genesis_id });
          logger.info(`[inscription_feed] rollback inscription ${genesis_id}`);
        }
        if (operation.inscription_transferred) {
          const genesis_id = operation.inscription_transferred.inscription_id;
          const satpoint = operation.inscription_transferred.satpoint_post_transfer.split(':');
          const output = `${satpoint[0]}:${satpoint[1]}`;
          await db.rollBackInscriptionTransfer({ genesis_id, output });
          logger.info(`[inscription_feed] rollback transfer ${genesis_id} ${output}`);
        }
      }
    }
  }
  for (const event of payload.apply) {
    for (const tx of event.transactions) {
      for (const operation of tx.metadata.ordinal_operations) {
        if (operation.inscription_revealed) {
          const reveal = operation.inscription_revealed;
          const txId = tx.transaction_identifier.hash.substring(2);
          const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
          await db.insertInscriptionGenesis({
            inscription: {
              genesis_id: reveal.inscription_id,
              mime_type: reveal.content_type.split(';')[0],
              content_type: reveal.content_type,
              content_length: reveal.content_length,
              number: reveal.inscription_number,
              content: reveal.content_bytes,
              fee: reveal.inscription_fee.toString(),
            },
            location: {
              genesis_id: reveal.inscription_id,
              block_height: event.block_identifier.index,
              block_hash: event.block_identifier.hash.substring(2),
              tx_id: txId,
              address: reveal.inscriber_address,
              output: `${txId}:0`,
              offset: reveal.ordinal_offset.toString(),
              value: reveal.inscription_output_value.toString(),
              timestamp: event.timestamp,
              sat_ordinal: reveal.ordinal_number.toString(),
              sat_rarity: satoshi.rarity,
              sat_coinbase_height: satoshi.blockHeight,
            },
          });
          logger.info(
            `[inscription_feed] apply inscription #${reveal.inscription_number} (${reveal.inscription_id}) at block ${event.block_identifier.index}`
          );
        }
        if (operation.inscription_transferred) {
          const transfer = operation.inscription_transferred;
          const txId = tx.transaction_identifier.hash.substring(2);
          const satpoint = transfer.satpoint_post_transfer.split(':');
          const offset = satpoint[2];
          const output = `${satpoint[0]}:${satpoint[1]}`;
          const satoshi = new OrdinalSatoshi(transfer.ordinal_number);
          await db.insertInscriptionTransfer({
            location: {
              genesis_id: transfer.inscription_id,
              block_height: event.block_identifier.index,
              block_hash: event.block_identifier.hash,
              tx_id: txId,
              address: transfer.updated_address,
              output: output,
              offset: offset ?? null,
              value: transfer.post_transfer_output_value
                ? transfer.post_transfer_output_value.toString()
                : null,
              timestamp: event.timestamp,
              sat_ordinal: transfer.ordinal_number.toString(),
              sat_rarity: satoshi.rarity,
              sat_coinbase_height: satoshi.blockHeight,
            },
          });
          logger.info(
            `[inscription_feed] apply transfer for #${transfer.inscription_number} (${transfer.inscription_id}) to output ${output} at block ${event.block_identifier.index}`
          );
        }
      }
    }
  }
  await db.updateChainTipInscriptionCount();
}

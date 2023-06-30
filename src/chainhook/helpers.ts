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
    throw new Error(`Unable to process invalid chainhook payload`);
  }
  await db.updateInscriptions(payload);
}

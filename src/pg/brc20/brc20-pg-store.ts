import { BasePgStoreModule, logger } from '@hirosystems/api-toolkit';
import * as postgres from 'postgres';
import { hexToBuffer } from '../../api/util/helpers';
import {
  DbInscriptionIndexPaging,
  InscriptionData,
  DbLocationPointerInsert,
  DbLocationTransferType,
  DbPaginatedResult,
  InscriptionEventData,
  LocationData,
  InscriptionRevealData,
} from '../types';
import {
  BRC20_DEPLOYS_COLUMNS,
  BRC20_OPERATIONS,
  DbBrc20Activity,
  DbBrc20Balance,
  DbBrc20BalanceTypeId,
  DbBrc20DeployEvent,
  DbBrc20DeployInsert,
  DbBrc20Event,
  DbBrc20EventOperation,
  DbBrc20Holder,
  DbBrc20MintEvent,
  DbBrc20Token,
  DbBrc20TokenWithSupply,
  DbBrc20TransferEvent,
} from './types';
import { Brc20Deploy, Brc20Mint, Brc20Transfer, brc20FromInscriptionContent } from './helpers';
import { Brc20TokenOrderBy } from '../../api/schemas';
import { objRemoveUndefinedValues } from '../helpers';

/** The block at which BRC-20 activity began */
export const BRC20_GENESIS_BLOCK = 779832;

export class Brc20PgStore extends BasePgStoreModule {
  sqlOr(partials: postgres.PendingQuery<postgres.Row[]>[] | undefined) {
    return partials?.reduce((acc, curr) => this.sql`${acc} OR ${curr}`);
  }

  async insertOperations(args: {
    reveals: InscriptionEventData[];
    pointers: DbLocationPointerInsert[];
  }): Promise<void> {
    for (const [i, reveal] of args.reveals.entries()) {
      const pointer = args.pointers[i];
      if (parseInt(pointer.block_height) < BRC20_GENESIS_BLOCK) continue;
      if ('inscription' in reveal) {
        if (
          reveal.inscription.classic_number < 0 ||
          reveal.inscription.number < 0 ||
          reveal.location.transfer_type != DbLocationTransferType.transferred
        )
          continue;
        const brc20 = brc20FromInscriptionContent(
          hexToBuffer(reveal.inscription.content as string).toString('utf-8')
        );
        if (brc20) {
          switch (brc20.op) {
            case 'deploy':
              await this.insertDeploy({ brc20, reveal, pointer });
              break;
            case 'mint':
              await this.insertMint({ brc20, reveal, pointer });
              break;
            case 'transfer':
              await this.insertTransfer({ brc20, reveal, pointer });
              break;
          }
        }
      } else {
        await this.applyTransfer({ reveal, pointer });
      }
    }
  }

  async applyTransfer(args: {
    reveal: InscriptionEventData;
    pointer: DbLocationPointerInsert;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Get the sender address for this transfer. We need to get this in a separate query to know
      // if we should alter the write query to accomodate a "return to sender" scenario.
      const fromAddressRes = await sql<{ from_address: string }[]>`
        SELECT from_address FROM brc20_transfers WHERE inscription_id = ${args.pointer.inscription_id}
      `;
      if (fromAddressRes.count === 0) return;
      const fromAddress = fromAddressRes[0].from_address;
      // Is this transfer sent as fee or from the same sender? If so, we'll return the balance.
      // Is it burnt? Mark as empty owner.
      const returnToSender =
        args.reveal.location.transfer_type == DbLocationTransferType.spentInFees ||
        fromAddress == args.pointer.address;
      const toAddress = returnToSender
        ? fromAddress
        : args.reveal.location.transfer_type == DbLocationTransferType.burnt
        ? ''
        : args.pointer.address;
      // Check if we have a valid transfer inscription emitted by this address that hasn't been sent
      // to another address before. Use `LIMIT 3` as a quick way of checking if we have just inserted
      // the first transfer for this inscription (genesis + transfer).
      const sendRes = await sql`
        WITH transfer_data AS (
          SELECT t.id, t.amount, t.brc20_deploy_id, t.from_address, ROW_NUMBER() OVER()
          FROM locations AS l
          INNER JOIN brc20_transfers AS t ON t.inscription_id = l.inscription_id
          WHERE l.inscription_id = ${args.pointer.inscription_id}
            AND (
              l.block_height < ${args.pointer.block_height}
              OR (l.block_height = ${args.pointer.block_height}
                AND l.tx_index <= ${args.pointer.tx_index})
            )
          LIMIT 3
        ),
        validated_transfer AS (
          SELECT * FROM transfer_data
          WHERE NOT EXISTS(SELECT id FROM transfer_data WHERE row_number = 3)
          LIMIT 1
        ),
        updated_transfer AS (
          UPDATE brc20_transfers
          SET to_address = ${toAddress}
          WHERE id = (SELECT id FROM validated_transfer)
        ),
        balance_insert_from AS (
          INSERT INTO brc20_balances (inscription_id, location_id, brc20_deploy_id, address, avail_balance, trans_balance, type) (
            SELECT ${args.pointer.inscription_id}, ${args.pointer.location_id}, brc20_deploy_id,
              from_address, 0, -1 * amount, ${DbBrc20BalanceTypeId.transferFrom}
            FROM validated_transfer
          )
          ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
        ),
        balance_insert_to AS (
          INSERT INTO brc20_balances (inscription_id, location_id, brc20_deploy_id, address, avail_balance, trans_balance, type) (
            SELECT ${args.pointer.inscription_id}, ${args.pointer.location_id}, brc20_deploy_id,
              ${toAddress}, amount, 0, ${DbBrc20BalanceTypeId.transferTo}
            FROM validated_transfer
          )
          ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
        ),
        ${
          returnToSender
            ? sql`
                total_balance_revert AS (
                  UPDATE brc20_total_balances SET
                    avail_balance = avail_balance + (SELECT amount FROM validated_transfer),
                    trans_balance = trans_balance - (SELECT amount FROM validated_transfer)
                  WHERE brc20_deploy_id = (SELECT brc20_deploy_id FROM validated_transfer)
                    AND address = (SELECT from_address FROM validated_transfer)
                ),
                address_event_type_count_increase AS (
                  INSERT INTO brc20_counts_by_address_event_type (address, transfer_send)
                  (SELECT from_address, 1 FROM validated_transfer)
                  ON CONFLICT (address) DO UPDATE SET transfer_send = brc20_counts_by_address_event_type.transfer_send + EXCLUDED.transfer_send
                )
              `
            : sql`
                total_balance_insert_from AS (
                  UPDATE brc20_total_balances SET
                    trans_balance = trans_balance - (SELECT amount FROM validated_transfer),
                    total_balance = total_balance - (SELECT amount FROM validated_transfer)
                  WHERE brc20_deploy_id = (SELECT brc20_deploy_id FROM validated_transfer)
                    AND address = (SELECT from_address FROM validated_transfer)
                ),
                total_balance_insert_to AS (
                  INSERT INTO brc20_total_balances (brc20_deploy_id, address, avail_balance, trans_balance, total_balance) (
                    SELECT brc20_deploy_id, ${toAddress}, amount, 0, amount
                    FROM validated_transfer
                  )
                  ON CONFLICT ON CONSTRAINT brc20_total_balances_unique DO UPDATE SET
                    avail_balance = brc20_total_balances.avail_balance + EXCLUDED.avail_balance,
                    total_balance = brc20_total_balances.total_balance + EXCLUDED.total_balance
                ),
                address_event_type_count_increase_from AS (
                  INSERT INTO brc20_counts_by_address_event_type (address, transfer_send)
                  (SELECT from_address, 1 FROM validated_transfer)
                  ON CONFLICT (address) DO UPDATE SET transfer_send = brc20_counts_by_address_event_type.transfer_send + EXCLUDED.transfer_send
                ),
                address_event_type_count_increase_to AS (
                  INSERT INTO brc20_counts_by_address_event_type (address, transfer_send)
                  (SELECT ${toAddress}, 1 FROM validated_transfer)
                  ON CONFLICT (address) DO UPDATE SET transfer_send = brc20_counts_by_address_event_type.transfer_send + EXCLUDED.transfer_send
                )
              `
        }, deploy_update AS (
          UPDATE brc20_deploys
          SET tx_count = tx_count + 1
          WHERE id = (SELECT brc20_deploy_id FROM validated_transfer)
        ),
        event_type_count_increase AS (
          INSERT INTO brc20_counts_by_event_type (event_type, count)
          (SELECT 'transfer_send', COALESCE(COUNT(*), 0) FROM validated_transfer)
          ON CONFLICT (event_type) DO UPDATE SET count = brc20_counts_by_event_type.count + EXCLUDED.count
        )
        INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, transfer_id, address, from_address) (
          SELECT 'transfer_send', ${args.pointer.inscription_id}, ${args.pointer.location_id},
            brc20_deploy_id, id, ${toAddress}, from_address
          FROM validated_transfer
        )
      `;
      if (sendRes.count)
        logger.info(
          `Brc20PgStore send transfer to ${toAddress} at block ${args.pointer.block_height}`
        );
    });
  }

  private async insertDeploy(deploy: {
    brc20: Brc20Deploy;
    reveal: InscriptionEventData;
    pointer: DbLocationPointerInsert;
  }): Promise<void> {
    if (deploy.reveal.location.transfer_type != DbLocationTransferType.transferred) return;
    const insert: DbBrc20DeployInsert = {
      inscription_id: deploy.pointer.inscription_id,
      block_height: deploy.pointer.block_height,
      tx_id: deploy.reveal.location.tx_id,
      address: deploy.pointer.address as string,
      ticker: deploy.brc20.tick,
      max: deploy.brc20.max,
      limit: deploy.brc20.lim ?? null,
      decimals: deploy.brc20.dec ?? '18',
      tx_count: 1,
    };
    const deployRes = await this.sql`
      WITH deploy_insert AS (
        INSERT INTO brc20_deploys ${this.sql(insert)}
        ON CONFLICT (LOWER(ticker)) DO NOTHING
        RETURNING id
      ),
      event_type_count_increase AS (
        INSERT INTO brc20_counts_by_event_type (event_type, count)
        (SELECT 'deploy', COALESCE(COUNT(*), 0) FROM deploy_insert)
        ON CONFLICT (event_type) DO UPDATE SET count = brc20_counts_by_event_type.count + EXCLUDED.count
      ),
      address_event_type_count_increase AS (
        INSERT INTO brc20_counts_by_address_event_type (address, deploy)
        (SELECT ${deploy.pointer.address}, COALESCE(COUNT(*), 0) FROM deploy_insert)
        ON CONFLICT (address) DO UPDATE SET deploy = brc20_counts_by_address_event_type.deploy + EXCLUDED.deploy
      ),
      token_count_increase AS (
        INSERT INTO brc20_counts_by_tokens (token_type, count)
        (SELECT 'token', COALESCE(COUNT(*), 0) FROM deploy_insert)
        ON CONFLICT (token_type) DO UPDATE SET count = brc20_counts_by_tokens.count + EXCLUDED.count
      )
      INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, deploy_id, address) (
        SELECT 'deploy', ${deploy.pointer.inscription_id}, ${deploy.pointer.location_id}, id, id,
          ${deploy.pointer.address}
        FROM deploy_insert
      )
    `;
    if (deployRes.count)
      logger.info(
        `Brc20PgStore deploy ${deploy.brc20.tick} by ${deploy.pointer.address} at block ${deploy.pointer.block_height}`
      );
  }

  private async insertMint(mint: {
    brc20: Brc20Mint;
    reveal: InscriptionEventData;
    pointer: DbLocationPointerInsert;
  }): Promise<void> {
    if (mint.reveal.location.transfer_type != DbLocationTransferType.transferred) return;
    // Check the following conditions:
    // * Is the mint amount within the allowed token limits?
    // * Is the number of decimals correct?
    // * Does the mint amount exceed remaining supply?
    const mintRes = await this.sql`
      WITH mint_data AS (
        SELECT id, decimals, "limit", max, minted_supply
        FROM brc20_deploys
        WHERE ticker_lower = LOWER(${mint.brc20.tick}) AND minted_supply < max
      ),
      validated_mint AS (
        SELECT
          id AS brc20_deploy_id,
          LEAST(${mint.brc20.amt}::numeric, max - minted_supply) AS real_mint_amount
        FROM mint_data
        WHERE ("limit" IS NULL OR ${mint.brc20.amt}::numeric <= "limit")
          AND (SCALE(${mint.brc20.amt}::numeric) <= decimals)
      ),
      mint_insert AS (
        INSERT INTO brc20_mints (inscription_id, brc20_deploy_id, block_height, tx_id, address, amount) (
          SELECT ${mint.pointer.inscription_id}, brc20_deploy_id, ${mint.pointer.block_height},
            ${mint.reveal.location.tx_id}, ${mint.pointer.address}, ${mint.brc20.amt}::numeric
          FROM validated_mint
        )
        ON CONFLICT (inscription_id) DO NOTHING
        RETURNING id, brc20_deploy_id
      ),
      deploy_update AS (
        UPDATE brc20_deploys
        SET
          minted_supply = minted_supply + (SELECT real_mint_amount FROM validated_mint),
          tx_count = tx_count + 1
        WHERE id = (SELECT brc20_deploy_id FROM validated_mint)
      ),
      balance_insert AS (
        INSERT INTO brc20_balances (inscription_id, location_id, brc20_deploy_id, address, avail_balance, trans_balance, type) (
          SELECT ${mint.pointer.inscription_id}, ${mint.pointer.location_id}, brc20_deploy_id,
            ${mint.pointer.address}, real_mint_amount, 0, ${DbBrc20BalanceTypeId.mint}
          FROM validated_mint
        )
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      ),
      total_balance_insert AS (
        INSERT INTO brc20_total_balances (brc20_deploy_id, address, avail_balance, trans_balance, total_balance) (
          SELECT brc20_deploy_id, ${mint.pointer.address}, real_mint_amount, 0, real_mint_amount
          FROM validated_mint
        )
        ON CONFLICT ON CONSTRAINT brc20_total_balances_unique DO UPDATE SET
          avail_balance = brc20_total_balances.avail_balance + EXCLUDED.avail_balance,
          total_balance = brc20_total_balances.total_balance + EXCLUDED.total_balance
      ),
      event_type_count_increase AS (
        INSERT INTO brc20_counts_by_event_type (event_type, count)
        (SELECT 'mint', COALESCE(COUNT(*), 0) FROM validated_mint)
        ON CONFLICT (event_type) DO UPDATE SET count = brc20_counts_by_event_type.count + EXCLUDED.count
      ),
      address_event_type_count_increase AS (
        INSERT INTO brc20_counts_by_address_event_type (address, mint)
        (SELECT ${mint.pointer.address}, COALESCE(COUNT(*), 0) FROM validated_mint)
        ON CONFLICT (address) DO UPDATE SET mint = brc20_counts_by_address_event_type.mint + EXCLUDED.mint
      )
      INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, mint_id, address) (
        SELECT 'mint', ${mint.pointer.inscription_id}, ${mint.pointer.location_id}, brc20_deploy_id, id, ${mint.pointer.address}
        FROM mint_insert
      )
    `;
    if (mintRes.count)
      logger.info(
        `Brc20PgStore mint ${mint.brc20.tick} (${mint.brc20.amt}) by ${mint.pointer.address} at block ${mint.pointer.block_height}`
      );
  }

  private async insertTransfer(transfer: {
    brc20: Brc20Transfer;
    reveal: InscriptionEventData;
    pointer: DbLocationPointerInsert;
  }): Promise<void> {
    if (transfer.reveal.location.transfer_type != DbLocationTransferType.transferred) return;
    // Check the following conditions:
    // * Do we have enough available balance to do this transfer?
    const transferRes = await this.sql`
      WITH balance_data AS (
        SELECT b.brc20_deploy_id, COALESCE(SUM(b.avail_balance), 0) AS avail_balance
        FROM brc20_balances AS b
        INNER JOIN brc20_deploys AS d ON b.brc20_deploy_id = d.id
        WHERE d.ticker_lower = LOWER(${transfer.brc20.tick})
          AND b.address = ${transfer.pointer.address}
        GROUP BY b.brc20_deploy_id
      ),
      validated_transfer AS (
        SELECT * FROM balance_data
        WHERE avail_balance >= ${transfer.brc20.amt}::numeric
      ),
      transfer_insert AS (
        INSERT INTO brc20_transfers (inscription_id, brc20_deploy_id, block_height, tx_id, from_address, to_address, amount) (
          SELECT ${transfer.pointer.inscription_id}, brc20_deploy_id,
            ${transfer.pointer.block_height}, ${transfer.reveal.location.tx_id},
            ${transfer.pointer.address}, NULL, ${transfer.brc20.amt}::numeric
          FROM validated_transfer
        )
        ON CONFLICT (inscription_id) DO NOTHING
        RETURNING id, brc20_deploy_id
      ),
      balance_insert AS (
        INSERT INTO brc20_balances (inscription_id, location_id, brc20_deploy_id, address, avail_balance, trans_balance, type) (
          SELECT ${transfer.pointer.inscription_id}, ${transfer.pointer.location_id}, brc20_deploy_id,
            ${transfer.pointer.address}, -1 * ${transfer.brc20.amt}::numeric,
            ${transfer.brc20.amt}::numeric, ${DbBrc20BalanceTypeId.transferIntent}
          FROM validated_transfer
        )
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      ),
      total_balance_update AS (
        UPDATE brc20_total_balances SET
          avail_balance = avail_balance - ${transfer.brc20.amt}::numeric,
          trans_balance = trans_balance + ${transfer.brc20.amt}::numeric
        WHERE brc20_deploy_id = (SELECT brc20_deploy_id FROM validated_transfer)
          AND address = ${transfer.pointer.address}
      ),
      deploy_update AS (
        UPDATE brc20_deploys
        SET tx_count = tx_count + 1
        WHERE id = (SELECT brc20_deploy_id FROM validated_transfer)
      ),
      event_type_count_increase AS (
        INSERT INTO brc20_counts_by_event_type (event_type, count)
        (SELECT 'transfer', COALESCE(COUNT(*), 0) FROM validated_transfer)
        ON CONFLICT (event_type) DO UPDATE SET count = brc20_counts_by_event_type.count + EXCLUDED.count
      ),
      address_event_type_count_increase AS (
        INSERT INTO brc20_counts_by_address_event_type (address, transfer)
        (SELECT ${transfer.pointer.address}, COALESCE(COUNT(*), 0) FROM validated_transfer)
        ON CONFLICT (address) DO UPDATE SET transfer = brc20_counts_by_address_event_type.transfer + EXCLUDED.transfer
      )
      INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, transfer_id, address) (
        SELECT 'transfer', ${transfer.pointer.inscription_id}, ${transfer.pointer.location_id}, brc20_deploy_id, id, ${transfer.pointer.address}
        FROM transfer_insert
      )
    `;
    if (transferRes.count)
      logger.info(
        `Brc20PgStore transfer ${transfer.brc20.tick} (${transfer.brc20.amt}) by ${transfer.pointer.address} at block ${transfer.pointer.block_height}`
      );
  }

  async rollBackInscription(args: { inscription: InscriptionData }): Promise<void> {
    const events = await this.sql<DbBrc20Event[]>`
      SELECT e.* FROM brc20_events AS e
      INNER JOIN inscriptions AS i ON i.id = e.inscription_id
      WHERE i.genesis_id = ${args.inscription.genesis_id}
    `;
    if (events.count === 0) return;
    // Traverse all activities generated by this inscription and roll back actions that are NOT
    // otherwise handled by the ON DELETE CASCADE postgres constraint.
    for (const event of events) {
      switch (event.operation) {
        case 'deploy':
          await this.rollBackDeploy(event);
          break;
        case 'mint':
          await this.rollBackMint(event);
          break;
        case 'transfer':
          await this.rollBackTransfer(event);
          break;
      }
    }
  }

  async rollBackLocation(args: { location: LocationData }): Promise<void> {
    const events = await this.sql<DbBrc20Event[]>`
      SELECT e.* FROM brc20_events AS e
      INNER JOIN locations AS l ON l.id = e.genesis_location_id
      WHERE output = ${args.location.output} AND "offset" = ${args.location.offset}
    `;
    if (events.count === 0) return;
    // Traverse all activities generated by this location and roll back actions that are NOT
    // otherwise handled by the ON DELETE CASCADE postgres constraint.
    for (const event of events) {
      switch (event.operation) {
        case 'transfer_send':
          await this.rollBackTransferSend(event);
          break;
      }
    }
  }

  private async rollBackDeploy(activity: DbBrc20DeployEvent): Promise<void> {
    // - tx_count is lost successfully, since the deploy will be deleted.
    await this.sql`
      WITH decrease_event_count AS (
        UPDATE brc20_counts_by_event_type
        SET count = count - 1
        WHERE event_type = 'deploy'
      ),
      decrease_address_event_count AS (
        UPDATE brc20_counts_by_address_event_type
        SET deploy = deploy - 1
        WHERE address = (SELECT address FROM locations WHERE id = ${activity.genesis_location_id})
      )
      UPDATE brc20_counts_by_tokens
      SET count = count - 1
    `;
  }

  private async rollBackMint(activity: DbBrc20MintEvent): Promise<void> {
    // Get real minted amount and substract from places.
    await this.sql`
      WITH minted_balance AS (
        SELECT address, avail_balance
        FROM brc20_balances
        WHERE inscription_id = ${activity.inscription_id} AND type = ${DbBrc20BalanceTypeId.mint}
      ),
      deploy_update AS (
        UPDATE brc20_deploys
        SET
          minted_supply = minted_supply - (SELECT avail_balance FROM minted_balance),
          tx_count = tx_count - 1
        WHERE id = ${activity.brc20_deploy_id}
      ),
      decrease_event_count AS (
        UPDATE brc20_counts_by_event_type
        SET count = count - 1
        WHERE event_type = 'mint'
      ),
      decrease_address_event_count AS (
        UPDATE brc20_counts_by_address_event_type
        SET mint = mint - 1
        WHERE address = (SELECT address FROM locations WHERE id = ${activity.genesis_location_id})
      )
      UPDATE brc20_total_balances SET
        avail_balance = avail_balance - (SELECT avail_balance FROM minted_balance),
        total_balance = total_balance - (SELECT avail_balance FROM minted_balance)
      WHERE address = (SELECT address FROM minted_balance)
        AND brc20_deploy_id = ${activity.brc20_deploy_id}
    `;
  }

  private async rollBackTransfer(activity: DbBrc20TransferEvent): Promise<void> {
    // Subtract tx_count per transfer event (transfer and transfer_send are
    // separate events, so they will both be counted).
    await this.sql`
      WITH transferrable_balance AS (
        SELECT address, trans_balance
        FROM brc20_balances
        WHERE inscription_id = ${activity.inscription_id} AND type = ${DbBrc20BalanceTypeId.transferIntent}
      ),
      decrease_event_count AS (
        UPDATE brc20_counts_by_event_type
        SET count = count - 1
        WHERE event_type = 'transfer'
      ),
      decrease_address_event_count AS (
        UPDATE brc20_counts_by_address_event_type
        SET transfer = transfer - 1
        WHERE address = (SELECT address FROM locations WHERE id = ${activity.genesis_location_id})
      ),
      decrease_tx_count AS (
        UPDATE brc20_deploys
        SET tx_count = tx_count - 1
        WHERE id = ${activity.brc20_deploy_id}
      )
      UPDATE brc20_total_balances SET
        trans_balance = trans_balance - (SELECT trans_balance FROM transferrable_balance),
        avail_balance = avail_balance + (SELECT trans_balance FROM transferrable_balance)
      WHERE address = (SELECT address FROM transferrable_balance)
        AND brc20_deploy_id = ${activity.brc20_deploy_id}
    `;
  }

  private async rollBackTransferSend(activity: DbBrc20TransferEvent): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Get the sender/receiver address for this transfer. We need to get this in a separate query
      // to know if we should alter the write query to accomodate a "return to sender" scenario.
      const addressRes = await sql<{ returned_to_sender: boolean }[]>`
        SELECT from_address = to_address AS returned_to_sender
        FROM brc20_transfers
        WHERE inscription_id = ${activity.inscription_id}
      `;
      if (addressRes.count === 0) return;
      const returnedToSender = addressRes[0].returned_to_sender;
      await sql`
        WITH sent_balance_from AS (
          SELECT address, trans_balance
          FROM brc20_balances
          WHERE inscription_id = ${activity.inscription_id}
          AND type = ${DbBrc20BalanceTypeId.transferFrom}
        ),
        sent_balance_to AS (
          SELECT address, avail_balance
          FROM brc20_balances
          WHERE inscription_id = ${activity.inscription_id}
          AND type = ${DbBrc20BalanceTypeId.transferTo}
        ),
        decrease_event_count AS (
          UPDATE brc20_counts_by_event_type
          SET count = count - 1
          WHERE event_type = 'transfer_send'
        ),
        ${
          returnedToSender
            ? sql`
                decrease_address_event_count AS (
                  UPDATE brc20_counts_by_address_event_type
                  SET transfer_send = transfer_send - 1
                  WHERE address = (SELECT address FROM sent_balance_from)
                ),
                undo_sent_balance AS (
                  UPDATE brc20_total_balances SET
                    trans_balance = trans_balance - (SELECT trans_balance FROM sent_balance_from),
                    avail_balance = avail_balance + (SELECT trans_balance FROM sent_balance_from)
                  WHERE address = (SELECT address FROM sent_balance_from)
                    AND brc20_deploy_id = ${activity.brc20_deploy_id}
                )
              `
            : sql`
                decrease_address_event_count_from AS (
                  UPDATE brc20_counts_by_address_event_type
                  SET transfer_send = transfer_send - 1
                  WHERE address = (SELECT address FROM sent_balance_from)
                ),
                decrease_address_event_count_to AS (
                  UPDATE brc20_counts_by_address_event_type
                  SET transfer_send = transfer_send - 1
                  WHERE address = (SELECT address FROM sent_balance_to)
                ),
                undo_sent_balance_from AS (
                  UPDATE brc20_total_balances SET
                    trans_balance = trans_balance - (SELECT trans_balance FROM sent_balance_from),
                    total_balance = total_balance - (SELECT trans_balance FROM sent_balance_from)
                  WHERE address = (SELECT address FROM sent_balance_from)
                    AND brc20_deploy_id = ${activity.brc20_deploy_id}
                ),
                undo_sent_balance_to AS (
                  UPDATE brc20_total_balances SET
                    avail_balance = avail_balance - (SELECT avail_balance FROM sent_balance_to),
                    total_balance = total_balance - (SELECT avail_balance FROM sent_balance_to)
                  WHERE address = (SELECT address FROM sent_balance_to)
                    AND brc20_deploy_id = ${activity.brc20_deploy_id}
                )
              `
        }
        UPDATE brc20_deploys
        SET tx_count = tx_count - 1
        WHERE id = ${activity.brc20_deploy_id}
      `;
    });
  }

  async getTokens(
    args: { ticker?: string[]; order_by?: Brc20TokenOrderBy } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Token>> {
    const tickerPrefixCondition = this.sqlOr(
      args.ticker?.map(t => this.sql`d.ticker_lower LIKE LOWER(${t}) || '%'`)
    );
    const orderBy =
      args.order_by === Brc20TokenOrderBy.tx_count
        ? this.sql`tx_count DESC` // tx_count
        : this.sql`l.block_height DESC, l.tx_index DESC`; // default: `index`
    const results = await this.sql<(DbBrc20Token & { total: number })[]>`
      ${
        args.ticker === undefined
          ? this.sql`WITH global_count AS (
              SELECT COALESCE(count, 0) AS count FROM brc20_counts_by_tokens
            )`
          : this.sql``
      }
      SELECT
        ${this.sql(BRC20_DEPLOYS_COLUMNS.map(c => `d.${c}`))},
        i.number, i.genesis_id, l.timestamp,
        ${
          args.ticker ? this.sql`COUNT(*) OVER()` : this.sql`(SELECT count FROM global_count)`
        } AS total
      FROM brc20_deploys AS d
      INNER JOIN inscriptions AS i ON i.id = d.inscription_id
      INNER JOIN genesis_locations AS g ON g.inscription_id = d.inscription_id
      INNER JOIN locations AS l ON l.id = g.location_id
      ${tickerPrefixCondition ? this.sql`WHERE ${tickerPrefixCondition}` : this.sql``}
      ORDER BY ${orderBy}
      OFFSET ${args.offset}
      LIMIT ${args.limit}
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }

  async getBalances(
    args: {
      address: string;
      ticker?: string[];
      block_height?: number;
    } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Balance>> {
    const ticker = this.sqlOr(
      args.ticker?.map(t => this.sql`d.ticker_lower LIKE LOWER(${t}) || '%'`)
    );
    // Change selection table depending if we're filtering by block height or not.
    const results = await this.sql<(DbBrc20Balance & { total: number })[]>`
      WITH token_ids AS (
        SELECT id FROM brc20_deploys AS d
        WHERE ${ticker ? ticker : this.sql`FALSE`}
      )
      ${
        args.block_height
          ? this.sql`
              SELECT
                d.ticker, d.decimals,
                SUM(b.avail_balance) AS avail_balance,
                SUM(b.trans_balance) AS trans_balance,
                SUM(b.avail_balance + b.trans_balance) AS total_balance,
                COUNT(*) OVER() as total
              FROM brc20_balances AS b
              INNER JOIN brc20_deploys AS d ON d.id = b.brc20_deploy_id
              INNER JOIN locations AS l ON l.id = b.location_id
              WHERE
                b.address = ${args.address}
                AND l.block_height <= ${args.block_height}
                ${ticker ? this.sql`AND brc20_deploy_id IN (SELECT id FROM token_ids)` : this.sql``}
              GROUP BY d.ticker, d.decimals
              HAVING SUM(b.avail_balance + b.trans_balance) > 0
            `
          : this.sql`
              SELECT d.ticker, d.decimals, b.avail_balance, b.trans_balance, b.total_balance, COUNT(*) OVER() as total
              FROM brc20_total_balances AS b
              INNER JOIN brc20_deploys AS d ON d.id = b.brc20_deploy_id
              WHERE
                b.total_balance > 0
                AND b.address = ${args.address}
                ${ticker ? this.sql`AND brc20_deploy_id IN (SELECT id FROM token_ids)` : this.sql``}
            `
      }
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }

  async getToken(args: { ticker: string }): Promise<DbBrc20TokenWithSupply | undefined> {
    const result = await this.sql<DbBrc20TokenWithSupply[]>`
      WITH token AS (
        SELECT
          ${this.sql(BRC20_DEPLOYS_COLUMNS.map(c => `d.${c}`))},
          i.number, i.genesis_id, l.timestamp
        FROM brc20_deploys AS d
        INNER JOIN inscriptions AS i ON i.id = d.inscription_id
        INNER JOIN genesis_locations AS g ON g.inscription_id = d.inscription_id
        INNER JOIN locations AS l ON l.id = g.location_id
        WHERE ticker_lower = LOWER(${args.ticker})
      ),
      holders AS (
        SELECT COUNT(*) AS count
        FROM brc20_total_balances
        WHERE brc20_deploy_id = (SELECT id FROM token) AND total_balance > 0
      )
      SELECT *, COALESCE((SELECT count FROM holders), 0) AS holders
      FROM token
    `;
    if (result.count) return result[0];
  }

  async getTokenHolders(
    args: {
      ticker: string;
    } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Holder> | undefined> {
    return await this.sqlTransaction(async sql => {
      const token = await sql<{ id: string; decimals: number }[]>`
        SELECT id, decimals FROM brc20_deploys WHERE ticker_lower = LOWER(${args.ticker})
      `;
      if (token.count === 0) return;
      const results = await sql<(DbBrc20Holder & { total: number })[]>`
        SELECT
          address, ${token[0].decimals}::int AS decimals, total_balance, COUNT(*) OVER() AS total
        FROM brc20_total_balances
        WHERE brc20_deploy_id = ${token[0].id}
        ORDER BY total_balance DESC
        LIMIT ${args.limit}
        OFFSET ${args.offset}
      `;
      return {
        total: results[0]?.total ?? 0,
        results: results ?? [],
      };
    });
  }

  async getActivity(
    page: DbInscriptionIndexPaging,
    filters: {
      ticker?: string[];
      block_height?: number;
      operation?: string[];
      address?: string;
    }
  ): Promise<DbPaginatedResult<DbBrc20Activity>> {
    // Do we need a specific result count such as total activity or activity per address?
    objRemoveUndefinedValues(filters);
    const filterLength = Object.keys(filters).length;
    const needsGlobalEventCount =
      filterLength === 0 ||
      (filterLength === 1 && filters.operation && filters.operation.length > 0);
    const needsAddressEventCount =
      (filterLength === 1 && filters.address != undefined && filters.address != '') ||
      (filterLength === 2 &&
        filters.operation &&
        filters.operation.length > 0 &&
        filters.address != undefined &&
        filters.address != '');
    const needsTickerCount = filterLength === 1 && filters.ticker && filters.ticker.length > 0;

    // Which operations do we need if we're filtering by address?
    const sanitizedOperations: DbBrc20EventOperation[] = [];
    for (const i of filters.operation ?? BRC20_OPERATIONS)
      if (BRC20_OPERATIONS.includes(i)) sanitizedOperations?.push(i as DbBrc20EventOperation);

    // Which tickers are we filtering for?
    const tickerConditions = this.sqlOr(
      filters.ticker?.map(t => this.sql`ticker_lower = LOWER(${t})`)
    );

    return this.sqlTransaction(async sql => {
      // The postgres query planner has trouble selecting an optimal plan when the WHERE condition
      // checks any column from the `brc20_deploys` table. If the user is filtering by ticker, we
      // should get the token IDs first and use those to filter directly in the `brc20_events`
      // table.
      const tickerIds = tickerConditions
        ? (await sql<{ id: string }[]>`SELECT id FROM brc20_deploys WHERE ${tickerConditions}`).map(
            i => i.id
          )
        : undefined;
      const results = await sql<(DbBrc20Activity & { total: number })[]>`
        WITH event_count AS (${
          // Select count from the correct count cache table.
          needsGlobalEventCount
            ? sql`
                SELECT COALESCE(SUM(count), 0) AS count
                FROM brc20_counts_by_event_type
                ${filters.operation ? sql`WHERE event_type IN ${sql(filters.operation)}` : sql``}
              `
            : needsAddressEventCount
            ? sql`
                SELECT COALESCE(${sql.unsafe(sanitizedOperations.join('+'))}, 0) AS count
                FROM brc20_counts_by_address_event_type
                WHERE address = ${filters.address}
              `
            : needsTickerCount && tickerIds !== undefined
            ? sql`
                SELECT COALESCE(SUM(tx_count), 0) AS count
                FROM brc20_deploys AS d
                WHERE id IN ${sql(tickerIds)}
              `
            : sql`SELECT NULL AS count`
        })
        SELECT
          e.operation,
          d.ticker,
          l.genesis_id AS inscription_id,
          l.block_height,
          l.block_hash,
          l.tx_id,
          l.address,
          l.timestamp,
          l.output,
          l.offset,
          d.max AS deploy_max,
          d.limit AS deploy_limit,
          d.decimals AS deploy_decimals,
          (SELECT amount FROM brc20_mints WHERE id = e.mint_id) AS mint_amount,
          (SELECT amount || ';' || from_address || ';' || COALESCE(to_address, '') FROM brc20_transfers WHERE id = e.transfer_id) AS transfer_data,
          ${
            needsGlobalEventCount || needsAddressEventCount || needsTickerCount
              ? sql`(SELECT count FROM event_count)`
              : sql`COUNT(*) OVER()`
          } AS total
        FROM brc20_events AS e
        INNER JOIN brc20_deploys AS d ON e.brc20_deploy_id = d.id
        INNER JOIN locations AS l ON e.genesis_location_id = l.id
        WHERE TRUE
          ${filters.operation ? sql`AND e.operation IN ${sql(filters.operation)}` : sql``}
          ${tickerIds ? sql`AND e.brc20_deploy_id IN ${sql(tickerIds)}` : sql``}
          ${filters.block_height ? sql`AND l.block_height = ${filters.block_height}` : sql``}
          ${
            filters.address
              ? sql`AND (e.address = ${filters.address} OR e.from_address = ${filters.address})`
              : sql``
          }
        ORDER BY l.block_height DESC, l.tx_index DESC
        LIMIT ${page.limit}
        OFFSET ${page.offset}
      `;
      return {
        total: results[0]?.total ?? 0,
        results: results ?? [],
      };
    });
  }
}

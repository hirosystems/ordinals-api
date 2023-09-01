import { BasePgStoreModule, logger } from '@hirosystems/api-toolkit';
import * as postgres from 'postgres';
import { hexToBuffer } from '../../api/util/helpers';
import { DbInscriptionIndexPaging, DbPaginatedResult } from '../types';
import {
  DbBrc20Token,
  DbBrc20Balance,
  DbBrc20Holder,
  BRC20_DEPLOYS_COLUMNS,
  DbBrc20BalanceTypeId,
  DbBrc20ScannedInscription,
  DbBrc20DeployInsert,
  DbBrc20Location,
  DbBrc20Activity,
  DbBrc20TokenWithSupply,
} from './types';
import { Brc20Deploy, Brc20Mint, Brc20Transfer, brc20FromInscriptionContent } from './helpers';

export class Brc20PgStore extends BasePgStoreModule {
  sqlOr(partials: postgres.PendingQuery<postgres.Row[]>[] | undefined) {
    return partials?.reduce((acc, curr) => this.sql`${acc} OR ${curr}`);
  }

  /**
   * Perform a scan of all inscriptions stored in the DB divided by block in order to look for
   * BRC-20 operations.
   * @param startBlock - Start at block height
   * @param endBlock - End at block height
   */
  async scanBlocks(startBlock: number, endBlock: number): Promise<void> {
    for (let blockHeight = startBlock; blockHeight <= endBlock; blockHeight++) {
      logger.info(`Brc20PgStore scanning block ${blockHeight}`);
      await this.sqlWriteTransaction(async sql => {
        const block = await sql<DbBrc20ScannedInscription[]>`
          SELECT
            EXISTS(SELECT location_id FROM genesis_locations WHERE location_id = l.id) AS genesis,
            l.id, l.inscription_id, l.block_height, l.tx_id, l.tx_index, l.address
          FROM locations AS l
          INNER JOIN inscriptions AS i ON l.inscription_id = i.id
          WHERE l.block_height = ${blockHeight}
            AND i.number >= 0
            AND i.mime_type IN ('application/json', 'text/plain')
          ORDER BY tx_index ASC
        `;
        await this.insertOperations(block);
      });
    }
  }

  async insertOperations(writes: DbBrc20ScannedInscription[]): Promise<void> {
    if (writes.length === 0) return;
    for (const write of writes) {
      if (write.genesis) {
        if (write.address === null) continue;
        const content = await this.sql<{ content: string }[]>`
          SELECT content FROM inscriptions WHERE id = ${write.inscription_id}
        `;
        const brc20 = brc20FromInscriptionContent(
          hexToBuffer(content[0].content).toString('utf-8')
        );
        if (brc20) {
          switch (brc20.op) {
            case 'deploy':
              await this.insertDeploy({ op: brc20, location: write });
              break;
            case 'mint':
              await this.insertMint({ op: brc20, location: write });
              break;
            case 'transfer':
              await this.insertTransfer({ op: brc20, location: write });
              break;
          }
        }
      } else {
        await this.applyTransfer(write);
      }
    }
  }

  async applyTransfer(location: DbBrc20ScannedInscription): Promise<void> {
    if (!location.inscription_id) return;
    // Is this a BRC-20 balance transfer? Check if we have a valid transfer inscription emitted by
    // this address that hasn't been sent to another address before. Use `LIMIT 3` as a quick way
    // of checking if we have just inserted the first transfer for this inscription (genesis +
    // transfer).
    const sendRes = await this.sql`
      WITH transfer_data AS (
        SELECT t.id, t.amount, t.brc20_deploy_id, t.from_address, ROW_NUMBER() OVER()
        FROM locations AS l
        INNER JOIN brc20_transfers AS t ON t.inscription_id = l.inscription_id
        WHERE l.inscription_id = ${location.inscription_id}
          AND (
            l.block_height < ${location.block_height}
            OR (l.block_height = ${location.block_height} AND l.tx_index < ${location.tx_index})
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
        SET to_address = COALESCE(${location.address}, (SELECT from_address FROM validated_transfer))
        WHERE id = (SELECT id FROM validated_transfer)
      ),
      balance_insert_from AS (
        INSERT INTO brc20_balances (inscription_id, location_id, brc20_deploy_id, address, avail_balance, trans_balance, type) (
          SELECT ${location.inscription_id}, ${location.id}, brc20_deploy_id, from_address, 0,
            -1 * amount, ${DbBrc20BalanceTypeId.transferFrom}
          FROM validated_transfer
        )
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      ),
      balance_insert_to AS (
        INSERT INTO brc20_balances (inscription_id, location_id, brc20_deploy_id, address, avail_balance, trans_balance, type) (
          SELECT ${location.inscription_id}, ${location.id}, brc20_deploy_id,
            COALESCE(${location.address}, from_address), amount, 0,
            ${DbBrc20BalanceTypeId.transferTo}
          FROM validated_transfer
        )
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      )
      INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, transfer_id) (
        SELECT 'transfer_send', id, ${location.id}, brc20_deploy_id, id
        FROM validated_transfer
      )
    `;
    if (sendRes.count)
      logger.info(
        `Brc20PgStore send transfer to ${location.address} at block ${location.block_height}`
      );
  }

  private async insertDeploy(deploy: {
    op: Brc20Deploy;
    location: DbBrc20Location;
  }): Promise<void> {
    if (!deploy.location.inscription_id || !deploy.location.address) return;
    const insert: DbBrc20DeployInsert = {
      inscription_id: deploy.location.inscription_id,
      block_height: deploy.location.block_height,
      tx_id: deploy.location.tx_id,
      address: deploy.location.address,
      ticker: deploy.op.tick,
      max: deploy.op.max,
      limit: deploy.op.lim ?? null,
      decimals: deploy.op.dec ?? '18',
    };
    const deployRes = await this.sql`
      WITH deploy_insert AS (
        INSERT INTO brc20_deploys ${this.sql(insert)}
        ON CONFLICT (LOWER(ticker)) DO NOTHING
        RETURNING id
      )
      INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, deploy_id) (
        SELECT 'deploy', ${deploy.location.inscription_id}, ${deploy.location.id}, id, id
        FROM deploy_insert
      )
    `;
    if (deployRes.count)
      logger.info(
        `Brc20PgStore deploy ${deploy.op.tick} by ${deploy.location.address} at block ${deploy.location.block_height}`
      );
  }

  private async insertMint(mint: { op: Brc20Mint; location: DbBrc20Location }): Promise<void> {
    if (!mint.location.inscription_id || !mint.location.address) return;
    // Check the following conditions:
    // * Is the mint amount within the allowed token limits?
    // * Is the number of decimals correct?
    // * Does the mint amount exceed remaining supply?
    const mintRes = await this.sql`
      WITH mint_data AS (
        SELECT id, decimals, "limit", max, minted_supply
        FROM brc20_deploys
        WHERE ticker_lower = LOWER(${mint.op.tick}) AND minted_supply < max
      ),
      validated_mint AS (
        SELECT
          id AS brc20_deploy_id,
          LEAST(${mint.op.amt}::numeric, max - minted_supply) AS real_mint_amount
        FROM mint_data
        WHERE ("limit" IS NULL OR ${mint.op.amt}::numeric <= "limit")
          AND (SCALE(${mint.op.amt}::numeric) <= decimals)
      ),
      mint_insert AS (
        INSERT INTO brc20_mints (inscription_id, brc20_deploy_id, block_height, tx_id, address, amount) (
          SELECT ${mint.location.inscription_id}, brc20_deploy_id, ${mint.location.block_height},
            ${mint.location.tx_id}, ${mint.location.address}, ${mint.op.amt}::numeric
          FROM validated_mint
        )
        ON CONFLICT (inscription_id) DO NOTHING
        RETURNING id, brc20_deploy_id
      ),
      supply_update AS (
        UPDATE brc20_deploys
        SET minted_supply = minted_supply + (SELECT real_mint_amount FROM validated_mint)
        WHERE id = (SELECT brc20_deploy_id FROM validated_mint)
      ),
      balance_insert AS (
        INSERT INTO brc20_balances (inscription_id, location_id, brc20_deploy_id, address, avail_balance, trans_balance, type) (
          SELECT ${mint.location.inscription_id}, ${mint.location.id}, brc20_deploy_id,
            ${mint.location.address}, real_mint_amount, 0, ${DbBrc20BalanceTypeId.mint}
          FROM validated_mint
        )
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      )
      INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, mint_id) (
        SELECT 'mint', ${mint.location.inscription_id}, ${mint.location.id}, brc20_deploy_id, id
        FROM mint_insert
      )
    `;
    if (mintRes.count)
      logger.info(
        `Brc20PgStore mint ${mint.op.tick} (${mint.op.amt}) by ${mint.location.address} at block ${mint.location.block_height}`
      );
  }

  private async insertTransfer(transfer: {
    op: Brc20Transfer;
    location: DbBrc20Location;
  }): Promise<void> {
    if (!transfer.location.inscription_id || !transfer.location.address) return;
    // Check the following conditions:
    // * Do we have enough available balance to do this transfer?
    const transferRes = await this.sql`
      WITH balance_data AS (
        SELECT b.brc20_deploy_id, COALESCE(SUM(b.avail_balance), 0) AS avail_balance
        FROM brc20_balances AS b
        INNER JOIN brc20_deploys AS d ON b.brc20_deploy_id = d.id
        WHERE d.ticker_lower = LOWER(${transfer.op.tick})
          AND b.address = ${transfer.location.address}
        GROUP BY b.brc20_deploy_id
      ),
      validated_transfer AS (
        SELECT * FROM balance_data
        WHERE avail_balance >= ${transfer.op.amt}::numeric
      ),
      transfer_insert AS (
        INSERT INTO brc20_transfers (inscription_id, brc20_deploy_id, block_height, tx_id, from_address, to_address, amount) (
          SELECT ${transfer.location.inscription_id}, brc20_deploy_id,
            ${transfer.location.block_height}, ${transfer.location.tx_id},
            ${transfer.location.address}, NULL, ${transfer.op.amt}::numeric
          FROM validated_transfer
        )
        ON CONFLICT (inscription_id) DO NOTHING
        RETURNING id, brc20_deploy_id
      ),
      balance_insert AS (
        INSERT INTO brc20_balances (inscription_id, location_id, brc20_deploy_id, address, avail_balance, trans_balance, type) (
          SELECT ${transfer.location.inscription_id}, ${transfer.location.id}, brc20_deploy_id,
            ${transfer.location.address}, -1 * ${transfer.op.amt}::numeric,
            ${transfer.op.amt}::numeric, ${DbBrc20BalanceTypeId.transferIntent}
          FROM validated_transfer
        )
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      )
      INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, transfer_id) (
        SELECT 'transfer', ${transfer.location.inscription_id}, ${transfer.location.id}, brc20_deploy_id, id
        FROM transfer_insert
      )
    `;
    if (transferRes.count)
      logger.info(
        `Brc20PgStore transfer ${transfer.op.tick} (${transfer.op.amt}) by ${transfer.location.address} at block ${transfer.location.block_height}`
      );
  }

  async getTokens(
    args: { ticker?: string[] } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Token>> {
    const tickerPrefixCondition = this.sqlOr(
      args.ticker?.map(t => this.sql`d.ticker_lower LIKE LOWER(${t}) || '%'`)
    );
    const results = await this.sql<(DbBrc20Token & { total: number })[]>`
      SELECT
        ${this.sql(BRC20_DEPLOYS_COLUMNS.map(c => `d.${c}`))},
        i.number, i.genesis_id, l.timestamp, 1 as total
      FROM brc20_deploys AS d
      INNER JOIN inscriptions AS i ON i.id = d.inscription_id
      INNER JOIN genesis_locations AS g ON g.inscription_id = d.inscription_id
      INNER JOIN locations AS l ON l.id = g.location_id
      ${tickerPrefixCondition ? this.sql`WHERE ${tickerPrefixCondition}` : this.sql``}
      ORDER BY l.block_height DESC, l.tx_index DESC
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
    const tickerPrefixConditions = this.sqlOr(
      args.ticker?.map(t => this.sql`d.ticker_lower LIKE LOWER(${t}) || '%'`)
    );
    const results = await this.sql<(DbBrc20Balance & { total: number })[]>`
      SELECT
        d.ticker, d.decimals,
        SUM(b.avail_balance) AS avail_balance,
        SUM(b.trans_balance) AS trans_balance,
        SUM(b.avail_balance + b.trans_balance) AS total_balance,
        1 as total
      FROM brc20_balances AS b
      INNER JOIN brc20_deploys AS d ON d.id = b.brc20_deploy_id
      ${
        args.block_height ? this.sql`INNER JOIN locations AS l ON l.id = b.location_id` : this.sql``
      }
      WHERE
        b.address = ${args.address}
        ${args.block_height ? this.sql`AND l.block_height <= ${args.block_height}` : this.sql``}
        ${tickerPrefixConditions ? this.sql`AND (${tickerPrefixConditions})` : this.sql``}
      GROUP BY d.ticker, d.decimals
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
        SELECT 1 AS holder
        FROM brc20_balances
        WHERE brc20_deploy_id = (SELECT id FROM token)
        GROUP BY address
        HAVING SUM(avail_balance + trans_balance) > 0
      )
      SELECT *, COALESCE((SELECT COUNT(*) FROM holders), 0) AS holders
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
          address, ${token[0].decimals}::int AS decimals, SUM(avail_balance + trans_balance) AS total_balance,
          1 AS total
        FROM brc20_balances
        WHERE brc20_deploy_id = ${token[0].id}
        GROUP BY address
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
    args: {
      ticker?: string[];
      block_height?: number;
      operation?: string[];
    } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Activity>> {
    const tickerConditions = this.sqlOr(
      args.ticker?.map(t => this.sql`d.ticker_lower = LOWER(${t})`)
    );
    const results = await this.sql<(DbBrc20Activity & { total: number })[]>`
      SELECT
        e.operation,
        d.ticker,
        l.genesis_id AS inscription_id,
        l.block_height,
        l.block_hash,
        l.tx_id,
        l.address,
        l.timestamp,
        d.max AS deploy_max,
        d.limit AS deploy_limit,
        d.decimals AS deploy_decimals,
        (SELECT amount FROM brc20_mints WHERE id = e.mint_id) AS mint_amount,
        (SELECT amount || ';' || from_address || ';' || COALESCE(to_address, '') FROM brc20_transfers WHERE id = e.transfer_id) AS transfer_data,
        1 as total
      FROM brc20_events AS e
      INNER JOIN brc20_deploys AS d ON e.brc20_deploy_id = d.id
      INNER JOIN locations AS l ON e.genesis_location_id = l.id
      WHERE TRUE
        ${args.operation ? this.sql`AND operation IN ${this.sql(args.operation)}` : this.sql``}
        ${tickerConditions ? this.sql`AND (${tickerConditions})` : this.sql``}
        ${args.block_height ? this.sql`AND l.block_height <= ${args.block_height}` : this.sql``}
      ORDER BY l.block_height DESC, l.tx_index DESC
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }
}

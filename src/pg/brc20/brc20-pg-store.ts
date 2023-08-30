import { PgSqlClient, logger } from '@hirosystems/api-toolkit';
import BigNumber from 'bignumber.js';
import * as postgres from 'postgres';
import { throwOnFirstRejected } from '../helpers';
import { PgStore } from '../pg-store';
import {
  DbInscriptionIndexPaging,
  DbPaginatedResult,
  LOCATIONS_COLUMNS,
  DbLocation,
} from '../types';
import {
  DbBrc20Token,
  DbBrc20Balance,
  DbBrc20Supply,
  DbBrc20Holder,
  DbBrc20Transfer,
  BRC20_TRANSFERS_COLUMNS,
  DbBrc20Deploy,
  BRC20_DEPLOYS_COLUMNS,
  DbBrc20BalanceInsert,
  DbBrc20BalanceTypeId,
  DbBrc20ScannedInscription,
  DbBrc20MintInsert,
  DbBrc20DeployInsert,
  DbBrc20TransferInsert,
} from './types';
import { Brc20Deploy, Brc20Mint, Brc20Transfer, brc20FromInscriptionContent } from './helpers';
import { hexToBuffer } from '../../api/util/helpers';

export class Brc20PgStore {
  // TODO: Move this to the api-toolkit so we can have pg submodules.
  private readonly parent: PgStore;
  private get sql(): PgSqlClient {
    return this.parent.sql;
  }

  constructor(db: PgStore) {
    this.parent = db;
  }

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
      await this.parent.sqlWriteTransaction(async sql => {
        const block = await sql<DbBrc20ScannedInscription[]>`
          SELECT
            EXISTS(SELECT location_id FROM genesis_locations WHERE location_id = l.id) AS genesis,
            ${sql(LOCATIONS_COLUMNS.map(c => `l.${c}`))}
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
        const content = await this.parent.sql<{ content: string }[]>`
          SELECT content FROM inscriptions WHERE id = ${write.inscription_id}
        `;
        const brc20 = brc20FromInscriptionContent(hexToBuffer(content[0].content));
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

  async getTokens(
    args: { ticker?: string[] } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Token>> {
    const tickerPrefixCondition = this.sqlOr(
      args.ticker?.map(t => this.sql`d.ticker_lower LIKE LOWER(${t}) || '%'`)
    );

    const results = await this.sql<(DbBrc20Token & { total: number })[]>`
      SELECT
        d.id, i.genesis_id, i.number, d.block_height, d.tx_id, d.address, d.ticker, d.max, d.limit,
        d.decimals, l.timestamp as deploy_timestamp, COALESCE(s.minted_supply, 0) as minted_supply, COUNT(*) OVER() as total
      FROM brc20_deploys AS d
      INNER JOIN inscriptions AS i ON i.id = d.inscription_id
      INNER JOIN genesis_locations AS g ON g.inscription_id = d.inscription_id
      INNER JOIN locations AS l ON l.id = g.location_id
      LEFT JOIN brc20_supplies AS s ON d.id = s.brc20_deploy_id
      ${tickerPrefixCondition ? this.sql`WHERE ${tickerPrefixCondition}` : this.sql``}
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
        d.ticker,
        SUM(b.avail_balance) AS avail_balance,
        SUM(b.trans_balance) AS trans_balance,
        SUM(b.avail_balance + b.trans_balance) AS total_balance,
        COUNT(*) OVER() as total
      FROM brc20_balances AS b
      INNER JOIN brc20_deploys AS d ON d.id = b.brc20_deploy_id
      ${
        args.block_height ? this.sql`INNER JOIN locations AS l ON l.id = b.location_id` : this.sql``
      }
      WHERE
        b.address = ${args.address}
        ${args.block_height ? this.sql`AND l.block_height <= ${args.block_height}` : this.sql``}
        ${tickerPrefixConditions ? this.sql`AND (${tickerPrefixConditions})` : this.sql``}
      GROUP BY d.ticker
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }

  async getTokenSupply(args: { ticker: string }): Promise<DbBrc20Supply | undefined> {
    return await this.parent.sqlTransaction(async sql => {
      const deploy = await this.getDeploy(args);
      if (!deploy) return;

      const supplyPromise = sql<{ max: string }[]>`
        SELECT max FROM brc20_deploys WHERE id = ${deploy.id}
      `;
      const mintedPromise = sql<{ minted_supply: string }[]>`
        SELECT minted_supply
        FROM brc20_supplies
        WHERE brc20_deploy_id = ${deploy.id}
      `;
      const holdersPromise = sql<{ count: string }[]>`
        SELECT COUNT(*) AS count
        FROM brc20_balances
        WHERE brc20_deploy_id = ${deploy.id}
        GROUP BY address
        HAVING SUM(avail_balance + trans_balance) > 0
      `;
      const settles = await Promise.allSettled([supplyPromise, holdersPromise, mintedPromise]);
      const [supply, holders, minted] = throwOnFirstRejected(settles);
      return {
        max_supply: supply[0].max,
        minted_supply: minted[0]?.minted_supply ?? '0',
        holders: holders[0]?.count ?? '0',
      };
    });
  }

  async getTokenHolders(
    args: {
      ticker: string;
    } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Holder> | undefined> {
    return await this.parent.sqlTransaction(async sql => {
      const deploy = await this.getDeploy(args);
      if (!deploy) {
        return;
      }
      const results = await this.sql<(DbBrc20Holder & { total: number })[]>`
        SELECT
          address, SUM(avail_balance + trans_balance) AS total_balance, COUNT(*) OVER() AS total
        FROM brc20_balances
        WHERE brc20_deploy_id = ${deploy.id}
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

  async applyTransfer(args: DbBrc20ScannedInscription): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      // Is this a BRC-20 balance transfer? Check if we have a valid transfer inscription emitted by
      // this address that hasn't been sent to another address before. Use `LIMIT 3` as a quick way
      // of checking if we have just inserted the first transfer for this inscription (genesis +
      // transfer).
      const brc20Transfer = await sql<DbBrc20Transfer[]>`
        SELECT ${sql(BRC20_TRANSFERS_COLUMNS.map(c => `t.${c}`))}
        FROM locations AS l
        INNER JOIN brc20_transfers AS t ON t.inscription_id = l.inscription_id
        WHERE l.inscription_id = ${args.inscription_id}
          AND (l.block_height < ${args.block_height}
            OR (l.block_height = ${args.block_height} AND l.tx_index < ${args.tx_index}))
        LIMIT 3
      `;
      if (brc20Transfer.count > 2) return;
      const transfer = brc20Transfer[0];
      const amount = new BigNumber(transfer.amount);
      const changes: DbBrc20BalanceInsert[] = [
        {
          inscription_id: transfer.inscription_id,
          location_id: args.id,
          brc20_deploy_id: transfer.brc20_deploy_id,
          address: transfer.from_address,
          avail_balance: '0',
          trans_balance: amount.negated().toString(),
          type: DbBrc20BalanceTypeId.transferFrom,
        },
        {
          inscription_id: transfer.inscription_id,
          location_id: args.id,
          brc20_deploy_id: transfer.brc20_deploy_id,
          // If a transfer is sent as fee, its amount must be returned to sender.
          address: args.address ?? transfer.from_address,
          avail_balance: amount.toString(),
          trans_balance: '0',
          type: DbBrc20BalanceTypeId.transferTo,
        },
      ];
      await sql`
        WITH updated_transfer AS (
          UPDATE brc20_transfers
          SET to_address = ${args.address}
          WHERE id = ${transfer.id}
        )
        INSERT INTO brc20_balances ${sql(changes)}
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      `;
    });
  }

  private async insertDeploy(deploy: { op: Brc20Deploy; location: DbLocation }): Promise<void> {
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
    const tickers = await this.parent.sql<{ ticker: string; address: string }[]>`
      INSERT INTO brc20_deploys ${this.parent.sql(insert)}
      ON CONFLICT (LOWER(ticker)) DO NOTHING
    `;
    if (tickers.count)
      logger.info(
        `Brc20PgStore deploy ${deploy.op.tick} by ${deploy.location.address} at block ${deploy.location.block_height}`
      );
  }

  private async getDeploy(args: { ticker: string }): Promise<DbBrc20Deploy | undefined> {
    const deploy = await this.sql<DbBrc20Deploy[]>`
      SELECT ${this.sql(BRC20_DEPLOYS_COLUMNS)}
      FROM brc20_deploys
      WHERE ticker_lower = LOWER(${args.ticker})
    `;
    if (deploy.count) return deploy[0];
  }

  private async insertMint(mint: { op: Brc20Mint; location: DbLocation }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      if (!mint.location.inscription_id || !mint.location.address) return;
      const tokenRes = await sql<
        { id: string; decimals: string; limit: string; max: string; minted_supply: string }[]
      >`
        SELECT
          d.id, d.decimals, d.limit, d.max,
          COALESCE(SUM(amount), 0) AS minted_supply
        FROM brc20_deploys AS d
        LEFT JOIN brc20_mints AS m ON m.brc20_deploy_id = d.id
        WHERE d.ticker_lower = LOWER(${mint.op.tick})
        GROUP BY d.id
      `;
      if (tokenRes.count === 0) return;
      const token = tokenRes[0];

      // Is the mint amount within the allowed token limits?
      if (token.limit && BigNumber(mint.op.amt).isGreaterThan(token.limit)) return;
      // Is the number of decimals correct?
      if (mint.op.amt.includes('.') && mint.op.amt.split('.')[1].length > parseInt(token.decimals))
        return;
      // Does the mint amount exceed remaining supply?
      const minted = new BigNumber(token.minted_supply);
      const availSupply = new BigNumber(token.max).minus(minted);
      if (availSupply.isLessThanOrEqualTo(0)) return;
      const mintAmt = BigNumber.min(availSupply, mint.op.amt);

      const mintInsert: DbBrc20MintInsert = {
        inscription_id: mint.location.inscription_id,
        brc20_deploy_id: token.id,
        block_height: mint.location.block_height,
        tx_id: mint.location.tx_id,
        address: mint.location.address,
        amount: mint.op.amt, // Original requested amount
      };
      const balanceInsert: DbBrc20BalanceInsert = {
        inscription_id: mint.location.inscription_id,
        location_id: mint.location.id,
        brc20_deploy_id: token.id,
        address: mint.location.address,
        avail_balance: mintAmt.toString(),
        trans_balance: '0',
        type: DbBrc20BalanceTypeId.mint,
      };

      await sql`
        WITH mint_insert AS (
          INSERT INTO brc20_mints ${sql(mintInsert)}
          ON CONFLICT (inscription_id) DO NOTHING
        )
        INSERT INTO brc20_balances ${sql(balanceInsert)}
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      `;
      logger.info(
        `Brc20PgStore mint ${mint.op.tick} (${mint.op.amt}) by ${mint.location.address} at block ${mint.location.block_height}`
      );
    });
  }

  private async insertTransfer(transfer: {
    op: Brc20Transfer;
    location: DbLocation;
  }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      if (!transfer.location.inscription_id || !transfer.location.address) return;
      const balanceRes = await sql<{ brc20_deploy_id: string; avail_balance: string }[]>`
        SELECT b.brc20_deploy_id, COALESCE(SUM(b.avail_balance), 0) AS avail_balance
        FROM brc20_balances AS b
        INNER JOIN brc20_deploys AS d ON b.brc20_deploy_id = d.id
        WHERE d.ticker_lower = LOWER(${transfer.op.tick})
          AND b.address = ${transfer.location.address}
        GROUP BY b.brc20_deploy_id
      `;
      if (balanceRes.count === 0) return;

      // Do we have enough available balance to do this transfer?
      const transAmt = new BigNumber(transfer.op.amt);
      const available = new BigNumber(balanceRes[0].avail_balance);
      if (transAmt.gt(available)) return;

      const transferInsert: DbBrc20TransferInsert = {
        inscription_id: transfer.location.inscription_id,
        brc20_deploy_id: balanceRes[0].brc20_deploy_id,
        block_height: transfer.location.block_height,
        tx_id: transfer.location.tx_id,
        from_address: transfer.location.address,
        to_address: null, // We don't know the receiver address yet
        amount: transfer.op.amt,
      };
      const balanceInsert: DbBrc20BalanceInsert = {
        inscription_id: transfer.location.inscription_id,
        location_id: transfer.location.id,
        brc20_deploy_id: balanceRes[0].brc20_deploy_id,
        address: transfer.location.address,
        avail_balance: transAmt.negated().toString(),
        trans_balance: transAmt.toString(),
        type: DbBrc20BalanceTypeId.transferIntent,
      };
      await sql`
        WITH transfer_insert AS (
          INSERT INTO brc20_transfers ${sql(transferInsert)}
          ON CONFLICT (inscription_id) DO NOTHING
        )
        INSERT INTO brc20_balances ${sql(balanceInsert)}
        ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
      `;
      logger.info(
        `Brc20PgStore transfer ${transfer.op.tick} (${transfer.op.amt}) by ${transfer.location.address} at block ${transfer.location.block_height}`
      );
    });
  }
}

import { PgSqlClient, logger } from '@hirosystems/api-toolkit';
import BigNumber from 'bignumber.js';
import * as postgres from 'postgres';
import { throwOnFirstRejected } from '../helpers';
import { PgStore } from '../pg-store';
import {
  DbInscriptionIndexPaging,
  DbInscriptionInsert,
  DbLocationInsert,
  DbPaginatedResult,
} from '../types';
import { Brc20Deploy, Brc20Mint, Brc20Transfer, brc20FromInscription } from './helpers';
import {
  BRC20_DEPLOYS_COLUMNS,
  BRC20_EVENTS_COLUMNS,
  BRC20_TRANSFERS_COLUMNS,
  DbBrc20Balance,
  DbBrc20BalanceInsert,
  DbBrc20BalanceTypeId,
  DbBrc20Deploy,
  DbBrc20DeployInsert,
  DbBrc20EventInsert,
  DbBrc20Holder,
  DbBrc20Supply,
  DbBrc20Token,
  DbBrc20Transfer,
} from './types';

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

  /**
   * Returns an address balance for a BRC-20 token.
   * @param address - Owner address
   * @param ticker - BRC-20 tickers
   * @returns `DbBrc20Balance`
   */
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

  async getHistory(args: { ticker: string } & DbInscriptionIndexPaging): Promise<void> {
    const results = await this.sql`
      WITH events AS (
        SELECT ${this.sql(BRC20_EVENTS_COLUMNS)}
        FROM brc20_events AS e
        INNER JOIN brc20_deploys AS d ON d.id = e.brc20_deploy_id
        INNER JOIN inscriptions AS i ON i.id = e.inscription_id
        WHERE d.ticker_lower = LOWER(${args.ticker})
        ORDER BY i.number DESC
        LIMIT ${args.limit}
        OFFSET ${args.offset}
      )
      SELECT *
      FROM events
      INNER JOIN
    `;
    // todo: use event history
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

  async insertOperation(args: {
    inscription_id: number;
    location_id: number;
    inscription: DbInscriptionInsert;
    location: DbLocationInsert;
  }): Promise<void> {
    if (args.inscription.number < 0) return; // No cursed inscriptions apply.
    // Is this a BRC-20 operation? Is it being inscribed to a valid address?
    const brc20 = brc20FromInscription(args.inscription);
    if (brc20) {
      if (args.location.address) {
        switch (brc20.op) {
          case 'deploy':
            await this.insertDeploy({
              deploy: brc20,
              inscription_id: args.inscription_id,
              location: args.location,
            });
            break;
          case 'mint':
            await this.insertMint({
              mint: brc20,
              inscription_id: args.inscription_id,
              location_id: args.location_id,
              location: args.location,
            });
            break;
          case 'transfer':
            await this.insertTransfer({
              transfer: brc20,
              inscription_id: args.inscription_id,
              location_id: args.location_id,
              location: args.location,
            });
            break;
        }
      } else {
        logger.debug(
          { block_height: args.location.block_height, tick: brc20.tick },
          `PgStore [BRC-20] ignoring operation spent as fee`
        );
      }
    }
  }

  async insertOperationTransfer(args: {
    inscription_id: number;
    inscription_number: number;
    location_id: number;
    location: DbLocationInsert;
  }): Promise<void> {
    if (args.inscription_number < 0) return; // No cursed inscriptions apply.
    // Is this a BRC-20 balance transfer? Check if we have a valid transfer inscription emitted by
    // this address that hasn't been sent to another address before. Use `LIMIT 3` as a quick way
    // of checking if we have just inserted the first transfer for this inscription (genesis +
    // transfer).
    await this.parent.sqlWriteTransaction(async sql => {
      const brc20Transfer = await sql<DbBrc20Transfer[]>`
        SELECT ${sql(BRC20_TRANSFERS_COLUMNS.map(c => `t.${c}`))}
        FROM locations AS l
        INNER JOIN brc20_transfers AS t ON t.inscription_id = l.inscription_id
        WHERE l.inscription_id = ${args.inscription_id}
          AND l.block_height <= ${args.location.block_height}
        LIMIT 3
      `;
      if (brc20Transfer.count === 2) {
        const transfer = brc20Transfer[0];
        // This is the first time this BRC-20 transfer is being used. Apply the balance change.
        const amount = new BigNumber(transfer.amount);
        const changes: DbBrc20BalanceInsert[] = [
          {
            inscription_id: transfer.inscription_id,
            location_id: args.location_id,
            brc20_deploy_id: transfer.brc20_deploy_id,
            address: transfer.from_address,
            avail_balance: '0',
            trans_balance: amount.negated().toString(),
            type: DbBrc20BalanceTypeId.transferFrom,
          },
          {
            inscription_id: transfer.inscription_id,
            location_id: args.location_id,
            brc20_deploy_id: transfer.brc20_deploy_id,
            address: args.location.address,
            avail_balance: amount.toString(),
            trans_balance: '0',
            type: DbBrc20BalanceTypeId.transferTo,
          },
        ];
        await sql`
          INSERT INTO brc20_balances ${sql(changes)}
          ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO UPDATE SET
            location_id = EXCLUDED.location_id,
            brc20_deploy_id = EXCLUDED.brc20_deploy_id,
            address = EXCLUDED.address,
            avail_balance = EXCLUDED.avail_balance,
            trans_balance = EXCLUDED.trans_balance
        `;
        // Keep the new valid owner of the transfer inscription
        await sql`
          UPDATE brc20_transfers
          SET to_address = ${args.location.address}
          WHERE id = ${transfer.id}
        `;
      } else {
        logger.debug(
          { genesis_id: args.location.genesis_id, block_height: args.location.block_height },
          `PgStore [BRC-20] ignoring balance change for transfer that was already used`
        );
      }
    });
  }

  private async insertDeploy(args: {
    deploy: Brc20Deploy;
    inscription_id: number;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      const address = args.location.address;
      if (!address) {
        logger.debug(
          `PgStore [BRC-20] ignoring deploy with null address for ${args.deploy.tick} at block ${args.location.block_height}`
        );
        return;
      }
      const deploy: DbBrc20DeployInsert = {
        inscription_id: args.inscription_id,
        block_height: args.location.block_height,
        tx_id: args.location.tx_id,
        address: address,
        ticker: args.deploy.tick,
        max: args.deploy.max,
        limit: args.deploy.lim ?? null,
        decimals: args.deploy.dec ?? '18',
      };
      const insertion = await sql<{ id: string }[]>`
        INSERT INTO brc20_deploys ${sql(deploy)}
        ON CONFLICT (LOWER(ticker)) DO NOTHING
        RETURNING id
      `;
      if (insertion.count > 0) {
        // Add to history
        const event: DbBrc20EventInsert = {
          inscription_id: args.inscription_id,
          brc20_deploy_id: insertion[0].id,
          deploy_id: insertion[0].id,
          mint_id: null,
          transfer_id: null,
        };
        await sql`
          INSERT INTO brc20_events ${sql(event)}
        `;
        logger.info(
          `PgStore [BRC-20] inserted deploy for ${args.deploy.tick} at block ${args.location.block_height}`
        );
      } else {
        logger.debug(
          `PgStore [BRC-20] ignoring duplicate deploy for ${args.deploy.tick} at block ${args.location.block_height}`
        );
      }
    });
  }

  private async getDeploy(args: { ticker: string }): Promise<DbBrc20Deploy | undefined> {
    const deploy = await this.sql<DbBrc20Deploy[]>`
      SELECT ${this.sql(BRC20_DEPLOYS_COLUMNS)}
      FROM brc20_deploys
      WHERE LOWER(ticker) = LOWER(${args.ticker})
    `;
    if (deploy.count) return deploy[0];
  }

  private async insertMint(args: {
    mint: Brc20Mint;
    inscription_id: number;
    location_id: number;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      // Is the token deployed?
      const token = await this.getDeploy({ ticker: args.mint.tick });
      if (!token) {
        logger.debug(
          `PgStore [BRC-20] ignoring mint for non-deployed token ${args.mint.tick} at block ${args.location.block_height}`
        );
        return;
      }

      // Is the mint amount within the allowed token limits?
      if (token.limit && BigNumber(args.mint.amt).isGreaterThan(token.limit)) {
        logger.debug(
          `PgStore [BRC-20] ignoring mint for ${args.mint.tick} that exceeds mint limit of ${token.limit} at block ${args.location.block_height}`
        );
        return;
      }
      // Is the number of decimals correct?
      if (
        args.mint.amt.includes('.') &&
        args.mint.amt.split('.')[1].length > parseInt(token.decimals)
      ) {
        logger.debug(
          `PgStore [BRC-20] ignoring mint for ${args.mint.tick} because amount ${args.mint.amt} exceeds token decimals at block ${args.location.block_height}`
        );
        return;
      }
      // Does the mint amount exceed remaining supply?
      const mintedSupply = await sql<{ minted: string }[]>`
        SELECT COALESCE(SUM(amount), 0) AS minted FROM brc20_mints WHERE brc20_deploy_id = ${token.id}
      `;
      const minted = new BigNumber(mintedSupply[0].minted);
      const availSupply = new BigNumber(token.max).minus(minted);
      if (availSupply.isLessThanOrEqualTo(0)) {
        logger.debug(
          `PgStore [BRC-20] ignoring mint for ${args.mint.tick} because token has been completely minted at block ${args.location.block_height}`
        );
        return;
      }
      const mintAmt = BigNumber.min(availSupply, args.mint.amt);

      const mint = {
        inscription_id: args.inscription_id,
        brc20_deploy_id: token.id,
        block_height: args.location.block_height,
        tx_id: args.location.tx_id,
        address: args.location.address,
        amount: args.mint.amt, // Original requested amount
      };
      await sql`INSERT INTO brc20_mints ${sql(mint)}`;
      logger.info(
        `PgStore [BRC-20] inserted mint for ${args.mint.tick} (${args.mint.amt}) at block ${args.location.block_height}`
      );

      // Insert balance change for minting address
      const balance: DbBrc20BalanceInsert = {
        inscription_id: args.inscription_id,
        location_id: args.location_id,
        brc20_deploy_id: parseInt(token.id),
        address: args.location.address,
        avail_balance: mintAmt.toString(),
        trans_balance: '0',
        type: DbBrc20BalanceTypeId.mint,
      };
      await sql`
        INSERT INTO brc20_balances ${sql(balance)}
      `;
    });
  }

  private async insertTransfer(args: {
    transfer: Brc20Transfer;
    inscription_id: number;
    location_id: number;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      // Is the destination a valid address?
      if (!args.location.address) {
        logger.debug(
          `PgStore [BRC-20] ignoring transfer spent as fee for ${args.transfer.tick} at block ${args.location.block_height}`
        );
        return;
      }
      // Is the token deployed?
      const token = await this.getDeploy({ ticker: args.transfer.tick });
      if (!token) {
        logger.debug(
          `PgStore [BRC-20] ignoring transfer for non-deployed token ${args.transfer.tick} at block ${args.location.block_height}`
        );
        return;
      }
      // Get balance for this address and this token
      const balanceResult = await this.getBalances({
        address: args.location.address,
        ticker: [args.transfer.tick],
        limit: 1,
        offset: 0,
      });
      // Do we have enough available balance to do this transfer?
      const transAmt = new BigNumber(args.transfer.amt);
      const available = new BigNumber(balanceResult.results[0]?.avail_balance ?? 0);
      if (transAmt.gt(available)) {
        logger.debug(
          `PgStore [BRC-20] ignoring transfer for token ${args.transfer.tick} due to unavailable balance at block ${args.location.block_height}`
        );
        return;
      }

      const transfer = {
        inscription_id: args.inscription_id,
        brc20_deploy_id: token.id,
        block_height: args.location.block_height,
        tx_id: args.location.tx_id,
        from_address: args.location.address,
        to_address: null, // We don't know the receiver address yet
        amount: args.transfer.amt,
      };
      await sql`INSERT INTO brc20_transfers ${sql(transfer)}`;
      logger.info(
        `PgStore [BRC-20] inserted transfer for ${args.transfer.tick} (${args.transfer.amt}) at block ${args.location.block_height}`
      );

      // Insert balance change for minting address
      const values: DbBrc20BalanceInsert = {
        inscription_id: args.inscription_id,
        location_id: args.location_id,
        brc20_deploy_id: parseInt(token.id),
        address: args.location.address,
        avail_balance: transAmt.negated().toString(),
        trans_balance: transAmt.toString(),
        type: DbBrc20BalanceTypeId.transferIntent,
      };
      await sql`
        INSERT INTO brc20_balances ${sql(values)}
      `;
    });
  }
}

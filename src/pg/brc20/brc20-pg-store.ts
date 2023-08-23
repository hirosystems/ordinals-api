import { PgSqlClient, logger } from '@hirosystems/api-toolkit';
import { PgStore } from '../pg-store';
import {
  DbInscriptionIndexPaging,
  DbPaginatedResult,
  DbLocationInsert,
  LOCATIONS_COLUMNS,
  DbLocation,
} from '../types';
import BigNumber from 'bignumber.js';
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

  async scanBlocks(startBlock?: number, endBlock?: number): Promise<void> {
    const range = await this.parent.sql<{ min: number; max: number }[]>`
      SELECT
        ${startBlock ? this.parent.sql`${startBlock}` : this.parent.sql`MIN(block_height)`} AS min,
        ${endBlock ? this.parent.sql`${endBlock}` : this.parent.sql`MAX(block_height)`} AS max
      FROM locations
    `;
    for (let blockHeight = range[0].min; blockHeight <= range[0].max; blockHeight++) {
      await this.parent.sqlWriteTransaction(async sql => {
        const block = await sql<DbBrc20ScannedInscription[]>`
          SELECT
            i.content,
            (
              CASE EXISTS(SELECT location_id FROM genesis_locations WHERE location_id = l.id)
                WHEN TRUE THEN TRUE
                ELSE FALSE
              END
            ) AS genesis,
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
    const deploys: { op: Brc20Deploy; location: DbLocation }[] = [];
    const mints: { op: Brc20Mint; location: DbLocation }[] = [];
    const transfers: { op: Brc20Transfer; location: DbLocation }[] = [];
    for (const w of writes) {
      if (w.genesis && w.address !== null) {
        const brc20 = brc20FromInscriptionContent(hexToBuffer(w.content));
        if (brc20) {
          switch (brc20.op) {
            case 'deploy':
              deploys.push({ op: brc20, location: w });
              break;
            case 'mint':
              mints.push({ op: brc20, location: w });
              break;
            case 'transfer':
              transfers.push({ op: brc20, location: w });
              break;
          }
        }
      }
      // TODO: transfers
    }
    await this.insertDeploys(deploys);
    await this.insertMints(mints);
  }

  async getTokens(
    args: { ticker?: string[] } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Token>> {
    const lowerTickers = args.ticker ? args.ticker.map(t => t.toLowerCase()) : undefined;
    const results = await this.sql<(DbBrc20Token & { total: number })[]>`
      SELECT
        d.id, i.genesis_id, i.number, d.block_height, d.tx_id, d.address, d.ticker, d.max, d.limit,
        d.decimals, COUNT(*) OVER() as total
      FROM brc20_deploys AS d
      INNER JOIN inscriptions AS i ON i.id = d.inscription_id
      ${lowerTickers ? this.sql`WHERE LOWER(d.ticker) IN ${this.sql(lowerTickers)}` : this.sql``}
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
    const lowerTickers = args.ticker ? args.ticker.map(t => t.toLowerCase()) : undefined;
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
        ${lowerTickers ? this.sql`AND LOWER(d.ticker) IN ${this.sql(lowerTickers)}` : this.sql``}
        ${args.block_height ? this.sql`AND l.block_height <= ${args.block_height}` : this.sql``}
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
      if (!deploy) {
        return;
      }
      const minted = await sql<{ total: string }[]>`
        SELECT SUM(avail_balance + trans_balance) AS total
        FROM brc20_balances
        WHERE brc20_deploy_id = ${deploy.id}
        GROUP BY brc20_deploy_id
      `;
      const holders = await sql<{ count: string }[]>`
        WITH historical_holders AS (
          SELECT SUM(avail_balance + trans_balance) AS balance
          FROM brc20_balances
          WHERE brc20_deploy_id = ${deploy.id}
          GROUP BY address
        )
        SELECT COUNT(*) AS count
        FROM historical_holders
        WHERE balance > 0
      `;
      const supply = await sql<{ max: string }[]>`
        SELECT max FROM brc20_deploys WHERE id = ${deploy.id}
      `;
      return {
        max_supply: supply[0].max,
        minted_supply: minted[0].total,
        holders: holders[0].count,
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

  // async insertOperationTransfer(args: {
  //   inscription_id: number;
  //   inscription_number: number;
  //   location_id: number;
  //   location: DbLocationInsert;
  // }): Promise<void> {
  //   if (args.inscription_number < 0) return; // No cursed inscriptions apply.
  //   // Is this a BRC-20 balance transfer? Check if we have a valid transfer inscription emitted by
  //   // this address that hasn't been sent to another address before. Use `LIMIT 3` as a quick way
  //   // of checking if we have just inserted the first transfer for this inscription (genesis +
  //   // transfer).
  //   await this.parent.sqlWriteTransaction(async sql => {
  //     const brc20Transfer = await sql<DbBrc20Transfer[]>`
  //       SELECT ${sql(BRC20_TRANSFERS_COLUMNS.map(c => `t.${c}`))}
  //       FROM locations AS l
  //       INNER JOIN brc20_transfers AS t ON t.inscription_id = l.inscription_id
  //       WHERE l.inscription_id = ${args.inscription_id}
  //         AND l.block_height <= ${args.location.block_height}
  //       LIMIT 3
  //     `;
  //     if (brc20Transfer.count === 2) {
  //       const transfer = brc20Transfer[0];
  //       // This is the first time this BRC-20 transfer is being used. Apply the balance change.
  //       const amount = new BigNumber(transfer.amount);
  //       const changes: DbBrc20BalanceInsert[] = [
  //         {
  //           inscription_id: transfer.inscription_id,
  //           location_id: args.location_id,
  //           brc20_deploy_id: transfer.brc20_deploy_id,
  //           address: transfer.from_address,
  //           avail_balance: '0',
  //           trans_balance: amount.negated().toString(),
  //           type: DbBrc20BalanceTypeId.transferFrom,
  //         },
  //         {
  //           inscription_id: transfer.inscription_id,
  //           location_id: args.location_id,
  //           brc20_deploy_id: transfer.brc20_deploy_id,
  //           address: args.location.address,
  //           avail_balance: amount.toString(),
  //           trans_balance: '0',
  //           type: DbBrc20BalanceTypeId.transferTo,
  //         },
  //       ];
  //       await sql`
  //         INSERT INTO brc20_balances ${sql(changes)}
  //         ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO UPDATE SET
  //           location_id = EXCLUDED.location_id,
  //           brc20_deploy_id = EXCLUDED.brc20_deploy_id,
  //           address = EXCLUDED.address,
  //           avail_balance = EXCLUDED.avail_balance,
  //           trans_balance = EXCLUDED.trans_balance
  //       `;
  //       // Keep the new valid owner of the transfer inscription
  //       await sql`
  //         UPDATE brc20_transfers
  //         SET to_address = ${args.location.address}
  //         WHERE id = ${transfer.id}
  //       `;
  //     } else {
  //       logger.debug(
  //         { genesis_id: args.location.genesis_id, block_height: args.location.block_height },
  //         `PgStore [BRC-20] ignoring balance change for transfer that was already used`
  //       );
  //     }
  //   });
  // }

  private async insertDeploys(deploys: { op: Brc20Deploy; location: DbLocation }[]): Promise<void> {
    if (deploys.length === 0) return;
    await this.parent.sqlWriteTransaction(async sql => {
      const inserts = deploys.map(i => ({
        inscription_id: i.location.inscription_id,
        block_height: i.location.block_height,
        tx_id: i.location.tx_id,
        address: i.location.address,
        ticker: i.op.tick,
        max: i.op.max,
        limit: i.op.lim ?? null,
        decimals: i.op.dec ?? '18',
      }));
      const tickers = await sql<{ ticker: string }[]>`
        INSERT INTO brc20_deploys ${sql(inserts)}
        ON CONFLICT (LOWER(ticker)) DO NOTHING
        RETURNING ticker
      `;
      for (const t of tickers) {
        logger.info(`Brc20PgStore deploy ${t.ticker} at block ${deploys[0].location.block_height}`);
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

  private async insertMints(mints: { op: Brc20Mint; location: DbLocation }[]): Promise<void> {
    if (mints.length === 0) return;
    await this.parent.sqlWriteTransaction(async sql => {
      const tokens = await sql<(DbBrc20Deploy & { minted_supply: string })[]>`
        SELECT
          ${sql(BRC20_DEPLOYS_COLUMNS.map(c => `d.${c}`))},
          COALESCE(SUM(amount), 0) AS minted_supply
        FROM brc20_deploys AS d
        LEFT JOIN brc20_mints AS m ON m.brc20_deploy_id = d.id
        WHERE LOWER(d.ticker) IN ${sql(mints.map(m => sql`LOWER(${m.op.tick})`))}
        GROUP BY d.id
      `;
      const tokenMap = new Map(tokens.map(t => [t.ticker.toLowerCase(), t]));

      const mintInserts: DbBrc20MintInsert[] = [];
      const balanceInserts: DbBrc20BalanceInsert[] = [];
      const mintedLog: { ticker: string; amount: string; address: string }[] = [];
      for (const mint of mints) {
        if (!mint.location.inscription_id || !mint.location.address) continue;
        const token = tokenMap.get(mint.op.tick.toLowerCase());
        if (!token) continue;

        // Is the mint amount within the allowed token limits?
        if (token.limit && BigNumber(mint.op.amt).isGreaterThan(token.limit)) continue;
        // Is the number of decimals correct?
        if (
          mint.op.amt.includes('.') &&
          mint.op.amt.split('.')[1].length > parseInt(token.decimals)
        )
          continue;
        // Does the mint amount exceed remaining supply?
        const minted = new BigNumber(token.minted_supply);
        const availSupply = new BigNumber(token.max).minus(minted);
        if (availSupply.isLessThanOrEqualTo(0)) continue;
        const mintAmt = BigNumber.min(availSupply, mint.op.amt);
        // Affect in-memory minted supply in case we get a new mint for this token in the same block
        token.minted_supply = minted.plus(mintAmt).toString();

        mintInserts.push({
          inscription_id: mint.location.inscription_id,
          brc20_deploy_id: token.id,
          block_height: mint.location.block_height,
          tx_id: mint.location.tx_id,
          address: mint.location.address,
          amount: mint.op.amt, // Original requested amount
        });
        balanceInserts.push({
          inscription_id: mint.location.inscription_id,
          location_id: mint.location.id,
          brc20_deploy_id: token.id,
          address: mint.location.address,
          avail_balance: mintAmt.toString(),
          trans_balance: '0',
          type: DbBrc20BalanceTypeId.mint,
        });
        mintedLog.push({
          ticker: token.ticker,
          amount: mintAmt.toString(),
          address: mint.location.address,
        });
      }

      if (mintInserts.length && balanceInserts.length) {
        await sql`
          INSERT INTO brc20_mints ${sql(mintInserts)}
        `;
        await sql`
          INSERT INTO brc20_balances ${sql(balanceInserts)}
          ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
        `;
        for (const m of mintedLog) {
          logger.info(
            `Brc20PgStore mint ${m.ticker} (${m.amount}) by ${m.address} at block ${mints[0].location.block_height}`
          );
        }
      }
    });
  }

  // private async insertTransfer(args: {
  //   transfer: Brc20Transfer;
  //   inscription_id: number;
  //   location_id: number;
  //   location: DbLocationInsert;
  // }): Promise<void> {
  //   await this.parent.sqlWriteTransaction(async sql => {
  //     // Is the destination a valid address?
  //     if (!args.location.address) {
  //       logger.debug(
  //         `PgStore [BRC-20] ignoring transfer spent as fee for ${args.transfer.tick} at block ${args.location.block_height}`
  //       );
  //       return;
  //     }
  //     // Is the token deployed?
  //     const token = await this.getDeploy({ ticker: args.transfer.tick });
  //     if (!token) {
  //       logger.debug(
  //         `PgStore [BRC-20] ignoring transfer for non-deployed token ${args.transfer.tick} at block ${args.location.block_height}`
  //       );
  //       return;
  //     }
  //     // Get balance for this address and this token
  //     const balanceResult = await this.getBalances({
  //       address: args.location.address,
  //       ticker: [args.transfer.tick],
  //       limit: 1,
  //       offset: 0,
  //     });
  //     // Do we have enough available balance to do this transfer?
  //     const transAmt = new BigNumber(args.transfer.amt);
  //     const available = new BigNumber(balanceResult.results[0]?.avail_balance ?? 0);
  //     if (transAmt.gt(available)) {
  //       logger.debug(
  //         `PgStore [BRC-20] ignoring transfer for token ${args.transfer.tick} due to unavailable balance at block ${args.location.block_height}`
  //       );
  //       return;
  //     }

  //     const transfer = {
  //       inscription_id: args.inscription_id,
  //       brc20_deploy_id: token.id,
  //       block_height: args.location.block_height,
  //       tx_id: args.location.tx_id,
  //       from_address: args.location.address,
  //       to_address: null, // We don't know the receiver address yet
  //       amount: args.transfer.amt,
  //     };
  //     await sql`
  //       INSERT INTO brc20_transfers ${sql(transfer)}
  //       ON CONFLICT ON CONSTRAINT (inscription_id) DO NOTHING
  //     `;
  //     logger.info(
  //       `PgStore [BRC-20] inserted transfer for ${args.transfer.tick} (${args.transfer.amt}) at block ${args.location.block_height}`
  //     );

  //     // Insert balance change for minting address
  //     const values: DbBrc20BalanceInsert = {
  //       inscription_id: args.inscription_id,
  //       location_id: args.location_id,
  //       brc20_deploy_id: parseInt(token.id),
  //       address: args.location.address,
  //       avail_balance: transAmt.negated().toString(),
  //       trans_balance: transAmt.toString(),
  //       type: DbBrc20BalanceTypeId.transferIntent,
  //     };
  //     await sql`
  //       INSERT INTO brc20_balances ${sql(values)}
  //       ON CONFLICT ON CONSTRAINT brc20_balances_inscription_id_type_unique DO NOTHING
  //     `;
  //   });
  // }
}

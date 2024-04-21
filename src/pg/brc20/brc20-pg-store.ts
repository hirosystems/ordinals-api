import { BasePgStoreModule, logger } from '@hirosystems/api-toolkit';
import * as postgres from 'postgres';
import {
  DbInscriptionIndexPaging,
  InscriptionData,
  DbPaginatedResult,
  LocationData,
} from '../types';
import {
  BRC20_DEPLOYS_COLUMNS,
  BRC20_OPERATIONS,
  DbBrc20Activity,
  DbBrc20Balance,
  DbBrc20TokenInsert,
  DbBrc20EventOperation,
  DbBrc20Holder,
  DbBrc20Token,
  DbBrc20TokenWithSupply,
  DbBrc20OperationInsert,
  DbBrc20Operation,
} from './types';
import { Brc20TokenOrderBy } from '../../api/schemas';
import { objRemoveUndefinedValues } from '../helpers';
import { BitcoinEvent } from '@hirosystems/chainhook-client';
import BigNumber from 'bignumber.js';

function increaseOperationCount(map: Map<DbBrc20Operation, number>, operation: DbBrc20Operation) {
  const current = map.get(operation);
  if (current == undefined) {
    map.set(operation, 1);
  } else {
    map.set(operation, current + 1);
  }
}

function increaseTokenMintedSupply(map: Map<string, BigNumber>, ticker: string, amount: BigNumber) {
  const current = map.get(ticker);
  if (current == undefined) {
    map.set(ticker, amount);
  } else {
    map.set(ticker, current.plus(amount));
  }
}

function increaseAddressOperationCount(
  map: Map<string, Map<DbBrc20Operation, number>>,
  address: string,
  operation: DbBrc20Operation
) {
  const current = map.get(address);
  if (current == undefined) {
    const opMap = new Map<DbBrc20Operation, number>();
    increaseOperationCount(opMap, operation);
    map.set(address, opMap);
  } else {
    increaseOperationCount(current, operation);
  }
}

interface AddressBalanceData {
  avail: BigNumber;
  trans: BigNumber;
  total: BigNumber;
}
function updateAddressBalance(
  map: Map<string, Map<string, AddressBalanceData>>,
  ticker: string,
  address: string,
  availBalance: BigNumber,
  transBalance: BigNumber,
  totalBalance: BigNumber
) {
  const current = map.get(address);
  if (current === undefined) {
    const opMap = new Map<string, AddressBalanceData>();
    opMap.set(ticker, { avail: availBalance, trans: transBalance, total: totalBalance });
    map.set(address, opMap);
  } else {
    const currentTick = current.get(ticker);
    if (currentTick === undefined) {
      current.set(ticker, { avail: availBalance, trans: transBalance, total: totalBalance });
    } else {
      current.set(ticker, {
        avail: availBalance.plus(currentTick.avail),
        trans: transBalance.plus(currentTick.trans),
        total: totalBalance.plus(currentTick.total),
      });
    }
  }
}

export class Brc20PgStore extends BasePgStoreModule {
  sqlOr(partials: postgres.PendingQuery<postgres.Row[]>[] | undefined) {
    return partials?.reduce((acc, curr) => this.sql`${acc} OR ${curr}`);
  }

  async updateBrc20Operations(event: BitcoinEvent): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      const block_height = event.block_identifier.index.toString();
      // Keep all DB changes in memory, write them at the end.
      const tokens: DbBrc20TokenInsert[] = [];
      const operations: DbBrc20OperationInsert[] = [];
      const tokenMintSupplies = new Map<string, BigNumber>();
      const operationCounts = new Map<DbBrc20Operation, number>();
      const addressOperationCounts = new Map<string, Map<DbBrc20Operation, number>>();
      const totalBalanceChanges = new Map<string, Map<string, AddressBalanceData>>();
      for (const tx of event.transactions) {
        const tx_index = tx.metadata.index.toString();
        if (tx.metadata.brc20_operation) {
          const operation = tx.metadata.brc20_operation;
          if ('deploy' in operation) {
            tokens.push({
              block_height,
              genesis_id: operation.deploy.inscription_id,
              tx_id: tx.transaction_identifier.hash,
              address: operation.deploy.address,
              ticker: operation.deploy.tick,
              max: operation.deploy.max,
              limit: operation.deploy.lim,
              decimals: operation.deploy.dec,
              self_mint: operation.deploy.self_mint,
            });
            operations.push({
              block_height,
              tx_index,
              genesis_id: operation.deploy.inscription_id,
              brc20_token_ticker: operation.deploy.tick,
              address: operation.deploy.address,
              avail_balance: '0',
              trans_balance: '0',
              operation: DbBrc20Operation.deploy,
            });
            increaseOperationCount(operationCounts, DbBrc20Operation.deploy);
            increaseAddressOperationCount(
              addressOperationCounts,
              operation.deploy.address,
              DbBrc20Operation.deploy
            );
            logger.info(
              `Brc20PgStore deploy ${operation.deploy.tick} by ${operation.deploy.address} at height ${block_height}`
            );
          } else if ('mint' in operation) {
            operations.push({
              block_height,
              tx_index,
              genesis_id: operation.mint.inscription_id,
              brc20_token_ticker: operation.mint.tick,
              address: operation.mint.address,
              avail_balance: operation.mint.amt,
              trans_balance: '0',
              operation: DbBrc20Operation.mint,
            });
            const amt = BigNumber(operation.mint.amt);
            increaseTokenMintedSupply(tokenMintSupplies, operation.mint.tick, amt);
            increaseOperationCount(operationCounts, DbBrc20Operation.mint);
            increaseAddressOperationCount(
              addressOperationCounts,
              operation.mint.address,
              DbBrc20Operation.mint
            );
            updateAddressBalance(
              totalBalanceChanges,
              operation.mint.tick,
              operation.mint.address,
              amt,
              BigNumber(0),
              amt
            );
            logger.info(
              `Brc20PgStore mint ${operation.mint.tick} ${operation.mint.amt} by ${operation.mint.address} at height ${block_height}`
            );
          } else if ('transfer' in operation) {
            operations.push({
              block_height,
              tx_index,
              genesis_id: operation.transfer.inscription_id,
              brc20_token_ticker: operation.transfer.tick,
              address: operation.transfer.address,
              avail_balance: BigNumber(operation.transfer.amt).negated().toString(),
              trans_balance: operation.transfer.amt,
              operation: DbBrc20Operation.transfer,
            });
            const amt = BigNumber(operation.transfer.amt);
            increaseOperationCount(operationCounts, DbBrc20Operation.transfer);
            increaseAddressOperationCount(
              addressOperationCounts,
              operation.transfer.address,
              DbBrc20Operation.deploy
            );
            updateAddressBalance(
              totalBalanceChanges,
              operation.transfer.tick,
              operation.transfer.address,
              amt.negated(),
              amt,
              BigNumber(0)
            );
            logger.info(
              `Brc20PgStore transfer ${operation.transfer.tick} ${operation.transfer.amt} by ${operation.transfer.address} at height ${block_height}`
            );
          } else if ('transfer_send' in operation) {
            operations.push({
              block_height,
              tx_index,
              genesis_id: operation.transfer_send.inscription_id,
              brc20_token_ticker: operation.transfer_send.tick,
              address: operation.transfer_send.sender_address,
              avail_balance: '0',
              trans_balance: BigNumber(operation.transfer_send.amt).negated().toString(),
              operation: DbBrc20Operation.transferSend,
            });
            operations.push({
              block_height,
              tx_index,
              genesis_id: operation.transfer_send.inscription_id,
              brc20_token_ticker: operation.transfer_send.tick,
              address: operation.transfer_send.receiver_address,
              avail_balance: operation.transfer_send.amt,
              trans_balance: '0',
              operation: DbBrc20Operation.transferReceive,
            });
            const amt = BigNumber(operation.transfer_send.amt);
            increaseOperationCount(operationCounts, DbBrc20Operation.transferSend);
            increaseAddressOperationCount(
              addressOperationCounts,
              operation.transfer_send.sender_address,
              DbBrc20Operation.transferSend
            );
            increaseAddressOperationCount(
              addressOperationCounts,
              operation.transfer_send.receiver_address,
              DbBrc20Operation.transferReceive
            );
            updateAddressBalance(
              totalBalanceChanges,
              operation.transfer_send.tick,
              operation.transfer_send.sender_address,
              BigNumber('0'),
              amt.negated(),
              amt.negated()
            );
            updateAddressBalance(
              totalBalanceChanges,
              operation.transfer_send.tick,
              operation.transfer_send.receiver_address,
              amt,
              BigNumber(0),
              amt
            );
            logger.info(
              `Brc20PgStore transfer_send ${operation.transfer_send.tick} ${operation.transfer_send.amt} from ${operation.transfer_send.sender_address} to ${operation.transfer_send.receiver_address} at height ${block_height}`
            );
          }
        }
      }
      if (tokens.length)
        await sql`
          INSERT INTO brc20_tokens ${sql(tokens)}
          ON CONFLICT (ticker) DO NOTHING
        `;
      if (operations.length)
        await sql`
          INSERT INTO brc20_operations ${sql(operations)}
          ON CONFLICT ON CONSTRAINT brc20_operations_unique DO NOTHING
        `;
      for (const [ticker, amount] of tokenMintSupplies) {
        await sql`
          UPDATE brc20_tokens SET minted_supply = minted_supply + ${amount.toString()}
          WHERE ticker = ${ticker}
        `;
      }
      if (operationCounts.size) {
        const entries = [];
        for (const [operation, count] of operationCounts) {
          entries.push({ operation, count });
        }
        await sql`
          INSERT INTO brc20_counts_by_operation ${sql(entries)}
          ON CONFLICT (operation) DO UPDATE SET
            count = brc20_counts_by_operation.count + EXCLUDED.count
        `;
      }
      if (addressOperationCounts.size) {
        const entries = [];
        for (const [address, map] of addressOperationCounts) {
          for (const [operation, count] of map) {
            entries.push({ address, operation, count });
          }
        }
        await sql`
          INSERT INTO brc20_counts_by_address_operation ${sql(entries)}
          ON CONFLICT (address, operation) DO UPDATE SET
            count = brc20_counts_by_address_operation.count + EXCLUDED.count
        `;
      }
      if (totalBalanceChanges.size) {
        const entries = [];
        for (const [address, map] of totalBalanceChanges) {
          for (const [ticker, values] of map) {
            entries.push({
              brc20_token_ticker: ticker,
              address,
              avail_balance: values.avail.toString(),
              trans_balance: values.trans.toString(),
              total_balance: values.total.toString(),
            });
          }
        }
        await sql`
          INSERT INTO brc20_total_balances ${sql(entries)}
          ON CONFLICT (brc20_token_ticker, address) DO UPDATE SET
            avail_balance = brc20_total_balances.avail_balance + EXCLUDED.avail_balance,
            trans_balance = brc20_total_balances.trans_balance + EXCLUDED.trans_balance,
            total_balance = brc20_total_balances.total_balance + EXCLUDED.total_balance
        `;
      }
    });
  }

  async rollBackInscription(args: { inscription: InscriptionData }): Promise<void> {
    // const events = await this.sql<DbBrc20Event[]>`
    //   SELECT e.* FROM brc20_events AS e
    //   INNER JOIN inscriptions AS i ON i.id = e.inscription_id
    //   WHERE i.genesis_id = ${args.inscription.genesis_id}
    // `;
    // if (events.count === 0) return;
    // // Traverse all activities generated by this inscription and roll back actions that are NOT
    // // otherwise handled by the ON DELETE CASCADE postgres constraint.
    // for (const event of events) {
    //   switch (event.operation) {
    //     case 'deploy':
    //       await this.rollBackDeploy(event);
    //       break;
    //     case 'mint':
    //       await this.rollBackMint(event);
    //       break;
    //     case 'transfer':
    //       await this.rollBackTransfer(event);
    //       break;
    //   }
    // }
  }

  async rollBackLocation(args: { location: LocationData }): Promise<void> {
    // const events = await this.sql<DbBrc20Event[]>`
    //   SELECT e.* FROM brc20_events AS e
    //   INNER JOIN locations AS l ON l.id = e.genesis_location_id
    //   WHERE output = ${args.location.output} AND "offset" = ${args.location.offset}
    // `;
    // if (events.count === 0) return;
    // // Traverse all activities generated by this location and roll back actions that are NOT
    // // otherwise handled by the ON DELETE CASCADE postgres constraint.
    // for (const event of events) {
    //   switch (event.operation) {
    //     case 'transfer_send':
    //       await this.rollBackTransferSend(event);
    //       break;
    //   }
    // }
  }

  async getTokens(
    args: { ticker?: string[]; order_by?: Brc20TokenOrderBy } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbBrc20Token>> {
    const tickerPrefixCondition = this.sqlOr(
      args.ticker?.map(t => this.sql`d.ticker LIKE LOWER(${t}) || '%'`)
    );
    const orderBy =
      args.order_by === Brc20TokenOrderBy.tx_count
        ? this.sql`d.tx_count DESC` // tx_count
        : this.sql`l.block_height DESC, l.tx_index DESC`; // default: `index`
    const results = await this.sql<(DbBrc20Token & { total: number })[]>`
      ${
        args.ticker === undefined
          ? this.sql`WITH global_count AS (
              SELECT COALESCE(count, 0) AS count
              FROM brc20_counts_by_operation
              WHERE operation = 'deploy'
            )`
          : this.sql``
      }
      SELECT
        d.*, i.number, l.timestamp,
        ${
          args.ticker ? this.sql`COUNT(*) OVER()` : this.sql`(SELECT count FROM global_count)`
        } AS total
      FROM brc20_tokens AS d
      INNER JOIN inscriptions AS i ON i.genesis_id = d.genesis_id
      INNER JOIN genesis_locations AS g ON g.inscription_id = i.id
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
    const ticker = this.sqlOr(args.ticker?.map(t => this.sql`d.ticker LIKE LOWER(${t}) || '%'`));
    // Change selection table depending if we're filtering by block height or not.
    const results = await this.sql<(DbBrc20Balance & { total: number })[]>`
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
              INNER JOIN brc20_tokens AS d ON d.ticker = b.brc20_token_ticker
              WHERE
                b.total_balance > 0
                AND b.address = ${args.address}
                ${ticker ? this.sql`AND ${ticker}` : this.sql``}
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

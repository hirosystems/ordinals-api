import BigNumber from 'bignumber.js';
import { Order, OrderBy } from '../api/schemas';
import { normalizedHexString, parseSatPoint } from '../api/util/helpers';
import { OrdinalSatoshi, SatoshiRarity } from '../api/util/ordinal-satoshi';
import { ChainhookPayload } from '../chainhook/schemas';
import { ENV } from '../env';
import { logger } from '../logger';
import {
  Brc20Deploy,
  Brc20Mint,
  Brc20Transfer,
  brc20FromInscription,
  getIndexResultCountType,
} from './helpers';
import { runMigrations } from './migrations';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';
import {
  DbBrc20DeployInsert,
  DbBrc20Balance,
  DbBrc20Token,
  DbFullyLocatedInscriptionResult,
  DbInscriptionContent,
  DbInscriptionIndexFilters,
  DbInscriptionIndexOrder,
  DbInscriptionIndexPaging,
  DbInscriptionIndexResultCountType,
  DbInscriptionInsert,
  DbInscriptionLocationChange,
  DbJsonContent,
  DbLocation,
  DbLocationInsert,
  DbPaginatedResult,
  JSON_CONTENTS_COLUMNS,
  LOCATIONS_COLUMNS,
  DbBrc20EventInsert,
  BRC20_EVENTS_COLUMNS,
  DbBrc20Deploy,
  BRC20_DEPLOYS_COLUMNS,
  BRC20_TRANSFERS_COLUMNS,
  DbBrc20Transfer,
} from './types';

type InscriptionIdentifier = { genesis_id: string } | { number: number };

export class PgStore extends BasePgStore {
  static async connect(opts?: { skipMigrations: boolean }): Promise<PgStore> {
    const pgConfig = {
      host: ENV.PGHOST,
      port: ENV.PGPORT,
      user: ENV.PGUSER,
      password: ENV.PGPASSWORD,
      database: ENV.PGDATABASE,
    };
    const sql = await connectPostgres({
      usageName: 'ordinals-pg-store',
      connectionArgs: pgConfig,
      connectionConfig: {
        poolMax: ENV.PG_CONNECTION_POOL_MAX,
        idleTimeout: ENV.PG_IDLE_TIMEOUT,
        maxLifetime: ENV.PG_MAX_LIFETIME,
      },
    });
    if (opts?.skipMigrations !== true) {
      await runMigrations('up');
    }
    return new PgStore(sql);
  }

  /**
   * Inserts inscription genesis and transfers from Chainhook events. Also handles rollbacks from
   * chain re-orgs and materialized view refreshes.
   * @param args - Apply/Rollback Chainhook events
   */
  async updateInscriptions(payload: ChainhookPayload): Promise<void> {
    const updatedInscriptionIds = new Set<number>();
    await this.sqlWriteTransaction(async sql => {
      for (const event of payload.rollback) {
        for (const tx of event.transactions) {
          for (const operation of tx.metadata.ordinal_operations) {
            if (operation.inscription_revealed) {
              const number = operation.inscription_revealed.inscription_number;
              const genesis_id = operation.inscription_revealed.inscription_id;
              await this.rollBackInscriptionGenesis({ genesis_id });
              logger.info(`PgStore rollback reveal #${number} (${genesis_id})`);
            }
            if (operation.cursed_inscription_revealed) {
              const number = operation.cursed_inscription_revealed.inscription_number;
              const genesis_id = operation.cursed_inscription_revealed.inscription_id;
              await this.rollBackInscriptionGenesis({ genesis_id });
              logger.info(`PgStore rollback cursed reveal #${number} (${genesis_id})`);
            }
            if (operation.inscription_transferred) {
              const number = operation.inscription_transferred.inscription_number;
              const genesis_id = operation.inscription_transferred.inscription_id;
              const satpoint = parseSatPoint(
                operation.inscription_transferred.satpoint_post_transfer
              );
              const output = `${satpoint.tx_id}:${satpoint.vout}`;
              const id = await this.rollBackInscriptionTransfer({ genesis_id, output });
              if (id) updatedInscriptionIds.add(id);
              logger.info(`PgStore rollback transfer #${number} (${genesis_id}) ${output}`);
            }
          }
        }
      }
      for (const event of payload.apply) {
        const block_height = event.block_identifier.index;
        const block_hash = normalizedHexString(event.block_identifier.hash);
        for (const tx of event.transactions) {
          const tx_id = normalizedHexString(tx.transaction_identifier.hash);
          for (const operation of tx.metadata.ordinal_operations) {
            if (operation.inscription_revealed) {
              const reveal = operation.inscription_revealed;
              const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
              const satpoint = parseSatPoint(reveal.satpoint_post_inscription);
              const id = await this.insertInscriptionGenesis({
                inscription: {
                  genesis_id: reveal.inscription_id,
                  mime_type: reveal.content_type.split(';')[0],
                  content_type: reveal.content_type,
                  content_length: reveal.content_length,
                  number: reveal.inscription_number,
                  content: reveal.content_bytes,
                  fee: reveal.inscription_fee.toString(),
                  curse_type: null,
                },
                location: {
                  block_hash,
                  block_height,
                  tx_id,
                  genesis_id: reveal.inscription_id,
                  address: reveal.inscriber_address,
                  output: `${satpoint.tx_id}:${satpoint.vout}`,
                  offset: satpoint.offset ?? null,
                  prev_output: null,
                  prev_offset: null,
                  value: reveal.inscription_output_value.toString(),
                  timestamp: event.timestamp,
                  sat_ordinal: reveal.ordinal_number.toString(),
                  sat_rarity: satoshi.rarity,
                  sat_coinbase_height: satoshi.blockHeight,
                },
              });
              if (id) updatedInscriptionIds.add(id);
              logger.info(
                `PgStore reveal #${reveal.inscription_number} (${reveal.inscription_id}) at block ${block_height}`
              );
            }
            if (operation.cursed_inscription_revealed) {
              const reveal = operation.cursed_inscription_revealed;
              const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
              const satpoint = parseSatPoint(reveal.satpoint_post_inscription);
              const id = await this.insertInscriptionGenesis({
                inscription: {
                  genesis_id: reveal.inscription_id,
                  mime_type: reveal.content_type.split(';')[0],
                  content_type: reveal.content_type,
                  content_length: reveal.content_length,
                  number: reveal.inscription_number,
                  content: reveal.content_bytes,
                  fee: reveal.inscription_fee.toString(),
                  curse_type: reveal.curse_type,
                },
                location: {
                  block_hash,
                  block_height,
                  tx_id,
                  genesis_id: reveal.inscription_id,
                  address: reveal.inscriber_address,
                  output: `${satpoint.tx_id}:${satpoint.vout}`,
                  offset: satpoint.offset ?? null,
                  prev_output: null,
                  prev_offset: null,
                  value: reveal.inscription_output_value.toString(),
                  timestamp: event.timestamp,
                  sat_ordinal: reveal.ordinal_number.toString(),
                  sat_rarity: satoshi.rarity,
                  sat_coinbase_height: satoshi.blockHeight,
                },
              });
              if (id) updatedInscriptionIds.add(id);
              logger.info(
                `PgStore cursed reveal #${reveal.inscription_number} (${reveal.inscription_id}) at block ${block_height}`
              );
            }
            if (operation.inscription_transferred) {
              const transfer = operation.inscription_transferred;
              const satpoint = parseSatPoint(transfer.satpoint_post_transfer);
              const prevSatpoint = parseSatPoint(transfer.satpoint_pre_transfer);
              const satoshi = new OrdinalSatoshi(transfer.ordinal_number);
              const id = await this.insertInscriptionTransfer({
                location: {
                  block_hash,
                  block_height,
                  tx_id,
                  genesis_id: transfer.inscription_id,
                  address: transfer.updated_address,
                  output: `${satpoint.tx_id}:${satpoint.vout}`,
                  offset: satpoint.offset ?? null,
                  prev_output: `${prevSatpoint.tx_id}:${prevSatpoint.vout}`,
                  prev_offset: prevSatpoint.offset ?? null,
                  value: transfer.post_transfer_output_value
                    ? transfer.post_transfer_output_value.toString()
                    : null,
                  timestamp: event.timestamp,
                  sat_ordinal: transfer.ordinal_number.toString(),
                  sat_rarity: satoshi.rarity,
                  sat_coinbase_height: satoshi.blockHeight,
                },
              });
              if (id) updatedInscriptionIds.add(id);
              logger.info(
                `PgStore transfer #${transfer.inscription_number} (${transfer.inscription_id}) to output ${satpoint.tx_id}:${satpoint.vout} at block ${block_height}`
              );
            }
          }
        }
      }
    });
    await this.normalizeInscriptionLocations({ inscription_id: Array.from(updatedInscriptionIds) });
    await this.refreshMaterializedView('chain_tip');
    await this.refreshMaterializedView('inscription_count');
    await this.refreshMaterializedView('mime_type_counts');
    await this.refreshMaterializedView('sat_rarity_counts');
  }

  async getChainTipBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  async getChainTipInscriptionCount(): Promise<number> {
    const result = await this.sql<{ count: number }[]>`
      SELECT count FROM inscription_count
    `;
    return result[0].count;
  }

  async getMimeTypeInscriptionCount(mimeType?: string[]): Promise<number> {
    if (!mimeType) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT SUM(count) AS count
      FROM mime_type_counts
      WHERE mime_type IN ${this.sql(mimeType)}
    `;
    return result[0].count;
  }

  async getSatRarityInscriptionCount(satRarity?: SatoshiRarity[]): Promise<number> {
    if (!satRarity) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT SUM(count) AS count
      FROM sat_rarity_counts
      WHERE sat_rarity IN ${this.sql(satRarity)}
    `;
    return result[0].count;
  }

  async getMaxInscriptionNumber(): Promise<number | undefined> {
    const result = await this.sql<{ max: string }[]>`
      SELECT MAX(number) FROM inscriptions WHERE number >= 0
    `;
    if (result[0].max) {
      return parseInt(result[0].max);
    }
  }

  async getMaxCursedInscriptionNumber(): Promise<number | undefined> {
    const result = await this.sql<{ min: string }[]>`
      SELECT MIN(number) FROM inscriptions WHERE number < 0
    `;
    if (result[0].min) {
      return parseInt(result[0].min);
    }
  }

  async getInscriptionTransfersETag(): Promise<string> {
    const result = await this.sql<{ max: number }[]>`SELECT MAX(id) FROM locations`;
    return result[0].max.toString();
  }

  async getInscriptionContent(
    args: InscriptionIdentifier
  ): Promise<DbInscriptionContent | undefined> {
    const result = await this.sql<DbInscriptionContent[]>`
      SELECT content, content_type, content_length
      FROM inscriptions
      WHERE ${
        'genesis_id' in args
          ? this.sql`genesis_id = ${args.genesis_id}`
          : this.sql`number = ${args.number}`
      }
    `;
    if (result.count > 0) {
      return result[0];
    }
  }

  async getInscriptionETag(args: InscriptionIdentifier): Promise<string | undefined> {
    const result = await this.sql<{ etag: string }[]>`
      SELECT date_part('epoch', l.timestamp)::text AS etag
      FROM locations AS l
      INNER JOIN inscriptions AS i ON l.inscription_id = i.id
      WHERE ${
        'genesis_id' in args
          ? this.sql`i.genesis_id = ${args.genesis_id}`
          : this.sql`i.number = ${args.number}`
      }
      AND l.current = TRUE
    `;
    if (result.count > 0) {
      return result[0].etag;
    }
  }

  async getInscriptions(
    page: DbInscriptionIndexPaging,
    filters?: DbInscriptionIndexFilters,
    sort?: DbInscriptionIndexOrder
  ): Promise<DbPaginatedResult<DbFullyLocatedInscriptionResult>> {
    return await this.sqlTransaction(async sql => {
      // Do we need a filtered `COUNT(*)`? If so, try to use the pre-calculated counts we have in
      // materialized views to speed up these queries.
      const countType = getIndexResultCountType(filters);
      // `ORDER BY` statement
      let orderBy = sql`gen.block_height`;
      switch (sort?.order_by) {
        case OrderBy.ordinal:
          orderBy = sql`loc.sat_ordinal`;
          break;
        case OrderBy.rarity:
          orderBy = sql`ARRAY_POSITION(ARRAY['common','uncommon','rare','epic','legendary','mythic'], loc.sat_rarity)`;
          break;
      }
      // `ORDER` statement
      const order = sort?.order === Order.asc ? sql`ASC` : sql`DESC`;
      const results = await sql<({ total: number } & DbFullyLocatedInscriptionResult)[]>`
        SELECT
          i.genesis_id,
          i.number,
          i.mime_type,
          i.content_type,
          i.content_length,
          i.fee AS genesis_fee,
          i.curse_type,
          gen.block_height AS genesis_block_height,
          gen.block_hash AS genesis_block_hash,
          gen.tx_id AS genesis_tx_id,
          gen.timestamp AS genesis_timestamp,
          gen.address AS genesis_address,
          loc.tx_id,
          loc.address,
          loc.output,
          loc.offset,
          loc.sat_ordinal,
          loc.sat_rarity,
          loc.timestamp,
          loc.value,
          loc.sat_coinbase_height,
          ${
            countType === DbInscriptionIndexResultCountType.custom
              ? sql`COUNT(*) OVER() as total`
              : sql`0 as total`
          }
        FROM inscriptions AS i
        INNER JOIN locations AS loc ON loc.inscription_id = i.id
        INNER JOIN locations AS gen ON gen.inscription_id = i.id
        WHERE loc.current = TRUE AND gen.genesis = TRUE
          ${
            filters?.genesis_id?.length
              ? sql`AND i.genesis_id IN ${sql(filters.genesis_id)}`
              : sql``
          }
          ${
            filters?.genesis_block_height
              ? sql`AND gen.block_height = ${filters.genesis_block_height}`
              : sql``
          }
          ${
            filters?.genesis_block_hash
              ? sql`AND gen.block_hash = ${filters.genesis_block_hash}`
              : sql``
          }
          ${
            filters?.from_genesis_block_height
              ? sql`AND gen.block_height >= ${filters.from_genesis_block_height}`
              : sql``
          }
          ${
            filters?.to_genesis_block_height
              ? sql`AND gen.block_height <= ${filters.to_genesis_block_height}`
              : sql``
          }
          ${
            filters?.from_sat_coinbase_height
              ? sql`AND loc.sat_coinbase_height >= ${filters.from_sat_coinbase_height}`
              : sql``
          }
          ${
            filters?.to_sat_coinbase_height
              ? sql`AND loc.sat_coinbase_height <= ${filters.to_sat_coinbase_height}`
              : sql``
          }
          ${
            filters?.from_genesis_timestamp
              ? sql`AND gen.timestamp >= to_timestamp(${filters.from_genesis_timestamp})`
              : sql``
          }
          ${
            filters?.to_genesis_timestamp
              ? sql`AND gen.timestamp <= to_timestamp(${filters.to_genesis_timestamp})`
              : sql``
          }
          ${
            filters?.from_sat_ordinal
              ? sql`AND loc.sat_ordinal >= ${filters.from_sat_ordinal}`
              : sql``
          }
          ${filters?.to_sat_ordinal ? sql`AND loc.sat_ordinal <= ${filters.to_sat_ordinal}` : sql``}
          ${filters?.number?.length ? sql`AND i.number IN ${sql(filters.number)}` : sql``}
          ${filters?.from_number ? sql`AND i.number >= ${filters.from_number}` : sql``}
          ${filters?.to_number ? sql`AND i.number <= ${filters.to_number}` : sql``}
          ${filters?.address?.length ? sql`AND loc.address IN ${sql(filters.address)}` : sql``}
          ${filters?.mime_type?.length ? sql`AND i.mime_type IN ${sql(filters.mime_type)}` : sql``}
          ${filters?.output ? sql`AND loc.output = ${filters.output}` : sql``}
          ${
            filters?.sat_rarity?.length
              ? sql`AND loc.sat_rarity IN ${sql(filters.sat_rarity)}`
              : sql``
          }
          ${filters?.sat_ordinal ? sql`AND loc.sat_ordinal = ${filters.sat_ordinal}` : sql``}
        ORDER BY ${orderBy} ${order}
        LIMIT ${page.limit}
        OFFSET ${page.offset}
      `;
      let total = results[0]?.total ?? 0;
      switch (countType) {
        case DbInscriptionIndexResultCountType.all:
          total = await this.getChainTipInscriptionCount();
          break;
        case DbInscriptionIndexResultCountType.mimeType:
          total = await this.getMimeTypeInscriptionCount(filters?.mime_type);
          break;
        case DbInscriptionIndexResultCountType.satRarity:
          total = await this.getSatRarityInscriptionCount(filters?.sat_rarity);
          break;
      }
      return {
        total,
        results: results ?? [],
      };
    });
  }

  async getInscriptionLocations(
    args: InscriptionIdentifier & { limit: number; offset: number }
  ): Promise<DbPaginatedResult<DbLocation>> {
    const results = await this.sql<({ total: number } & DbLocation)[]>`
      SELECT ${this.sql(LOCATIONS_COLUMNS.map(c => `l.${c}`))}, COUNT(*) OVER() as total
      FROM locations AS l
      INNER JOIN inscriptions AS i ON l.inscription_id = i.id
      WHERE
        ${
          'number' in args
            ? this.sql`i.number = ${args.number}`
            : this.sql`i.genesis_id = ${args.genesis_id}`
        }
      ORDER BY l.block_height DESC
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }

  async getTransfersPerBlock(
    args: { block_height?: number; block_hash?: string } & DbInscriptionIndexPaging
  ): Promise<DbPaginatedResult<DbInscriptionLocationChange>> {
    const results = await this.sql<({ total: number } & DbInscriptionLocationChange)[]>`
      WITH transfers AS (
        SELECT
          i.id AS inscription_id,
          i.genesis_id,
          i.number,
          l.id AS to_id,
          (
            SELECT id
            FROM locations AS ll
            WHERE
              ll.inscription_id = i.id
              AND ll.block_height < l.block_height
            ORDER BY ll.block_height DESC
            LIMIT 1
          ) AS from_id,
          COUNT(*) OVER() as total
        FROM locations AS l
        INNER JOIN inscriptions AS i ON l.inscription_id = i.id
        WHERE
          ${
            'block_height' in args
              ? this.sql`l.block_height = ${args.block_height}`
              : this.sql`l.block_hash = ${args.block_hash}`
          }
          AND l.genesis = FALSE
        LIMIT ${args.limit}
        OFFSET ${args.offset}
      )
      SELECT
        t.genesis_id,
        t.number,
        t.total,
        ${this.sql.unsafe(LOCATIONS_COLUMNS.map(c => `lf.${c} AS from_${c}`).join(','))},
        ${this.sql.unsafe(LOCATIONS_COLUMNS.map(c => `lt.${c} AS to_${c}`).join(','))}
      FROM transfers AS t
      INNER JOIN locations AS lf ON t.from_id = lf.id
      INNER JOIN locations AS lt ON t.to_id = lt.id
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }

  async getJsonContent(args: InscriptionIdentifier): Promise<DbJsonContent | undefined> {
    const results = await this.sql<DbJsonContent[]>`
      SELECT ${this.sql(JSON_CONTENTS_COLUMNS.map(c => `j.${c}`))}
      FROM json_contents AS j
      INNER JOIN inscriptions AS i ON j.inscription_id = i.id
      WHERE
        ${
          'number' in args
            ? this.sql`i.number = ${args.number}`
            : this.sql`i.genesis_id = ${args.genesis_id}`
        }
      LIMIT 1
    `;
    if (results.count === 1) {
      return results[0];
    }
  }

  async getBrc20Tokens(args: { ticker?: string[] }): Promise<DbPaginatedResult<DbBrc20Token>> {
    const lowerTickers = args.ticker ? args.ticker.map(t => t.toLowerCase()) : undefined;
    const results = await this.sql<(DbBrc20Token & { total: number })[]>`
      SELECT
        d.id, i.genesis_id, i.number, d.block_height, d.tx_id, d.address, d.ticker, d.max, d.limit,
        d.decimals, COUNT(*) OVER() as total
      FROM brc20_deploys AS d
      INNER JOIN inscriptions AS i ON i.id = d.inscription_id
      ${lowerTickers ? this.sql`WHERE LOWER(d.ticker) IN ${this.sql(lowerTickers)}` : this.sql``}
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
  async getBrc20Balances(
    args: {
      address: string;
      ticker?: string[];
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
      WHERE
        b.address = ${args.address}
        ${lowerTickers ? this.sql`AND LOWER(d.ticker) IN ${this.sql(lowerTickers)}` : this.sql``}
      GROUP BY d.ticker
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }

  async getBrc20History(args: { ticker: string } & DbInscriptionIndexPaging): Promise<void> {
    const results = await this.sql`
      WITH events AS (
        SELECT ${this.sql(BRC20_EVENTS_COLUMNS)}
        FROM brc20_events AS e
        INNER JOIN brc20_deploys AS d ON d.id = e.brc20_deploy_id
        INNER JOIN inscriptions AS i ON i.id = e.inscription_id
        WHERE LOWER(d.ticker) = LOWER(${args.ticker})
        ORDER BY i.number DESC
        LIMIT ${args.limit}
        OFFSET ${args.offset}
      )
      SELECT *
      FROM events
      INNER JOIN
    `;
  }

  async refreshMaterializedView(viewName: string) {
    const isProd = process.env.NODE_ENV === 'production';
    await this.sql`REFRESH MATERIALIZED VIEW ${
      isProd ? this.sql`CONCURRENTLY` : this.sql``
    } ${this.sql(viewName)}`;
  }

  private async insertInscriptionGenesis(args: {
    inscription: DbInscriptionInsert;
    location: DbLocationInsert;
  }): Promise<number | undefined> {
    let inscription_id: number | undefined;
    await this.sqlWriteTransaction(async sql => {
      // Are we upserting?
      const prevInscription = await sql<{ id: number }[]>`
        SELECT id FROM inscriptions WHERE number = ${args.inscription.number}
      `;
      if (prevInscription.count !== 0) {
        logger.warn(
          {
            block_height: args.location.block_height,
            genesis_id: args.inscription.genesis_id,
          },
          `PgStore upserting inscription genesis #${args.inscription.number}`
        );
      } else {
        // Is this a sequential genesis insert?
        if (args.inscription.number < 0) {
          // Is it a cursed inscription?
          const maxCursed = await this.getMaxCursedInscriptionNumber();
          if (maxCursed !== undefined && maxCursed - 1 !== args.inscription.number) {
            logger.warn(
              {
                block_height: args.location.block_height,
                genesis_id: args.inscription.genesis_id,
              },
              `PgStore inserting out-of-order cursed inscription genesis #${args.inscription.number}, current max is #${maxCursed}`
            );
          }
        } else {
          const maxNumber = await this.getMaxInscriptionNumber();
          if (maxNumber !== undefined && maxNumber + 1 !== args.inscription.number) {
            logger.warn(
              {
                block_height: args.location.block_height,
                genesis_id: args.inscription.genesis_id,
              },
              `PgStore inserting out-of-order inscription genesis #${args.inscription.number}, current max is #${maxNumber}`
            );
          }
          // Is this a blessed inscription in a duplicate sat?
          const dup = await sql<{ id: number }[]>`
            SELECT id FROM locations WHERE sat_ordinal = ${args.location.sat_ordinal}
          `;
          if (dup.count > 0) {
            logger.error(
              {
                block_height: args.location.block_height,
                genesis_id: args.inscription.genesis_id,
              },
              `PgStore inserting duplicate blessed inscription in satoshi ${args.location.sat_ordinal}`
            );
          }
        }
      }

      const inscription = await sql<{ id: number }[]>`
        INSERT INTO inscriptions ${sql(args.inscription)}
        ON CONFLICT ON CONSTRAINT inscriptions_number_unique DO UPDATE SET
          genesis_id = EXCLUDED.genesis_id,
          mime_type = EXCLUDED.mime_type,
          content_type = EXCLUDED.content_type,
          content_length = EXCLUDED.content_length,
          content = EXCLUDED.content,
          fee = EXCLUDED.fee
        RETURNING id
      `;
      inscription_id = inscription[0].id;
      const location = {
        inscription_id,
        block_height: args.location.block_height,
        block_hash: args.location.block_hash,
        tx_id: args.location.tx_id,
        address: args.location.address,
        output: args.location.output,
        offset: args.location.offset,
        prev_output: args.location.prev_output,
        prev_offset: args.location.prev_offset,
        value: args.location.value,
        sat_ordinal: args.location.sat_ordinal,
        sat_rarity: args.location.sat_rarity,
        sat_coinbase_height: args.location.sat_coinbase_height,
        timestamp: sql`to_timestamp(${args.location.timestamp})`,
      };
      await sql<DbLocation[]>`
        INSERT INTO locations ${sql(location)}
        ON CONFLICT ON CONSTRAINT locations_inscription_id_block_height_unique DO UPDATE SET
          block_hash = EXCLUDED.block_hash,
          tx_id = EXCLUDED.tx_id,
          address = EXCLUDED.address,
          output = EXCLUDED.output,
          "offset" = EXCLUDED.offset,
          value = EXCLUDED.value,
          sat_ordinal = EXCLUDED.sat_ordinal,
          sat_rarity = EXCLUDED.sat_rarity,
          sat_coinbase_height = EXCLUDED.sat_coinbase_height,
          timestamp = EXCLUDED.timestamp
      `;

      // Is this a BRC-20 operation?
      // TODO: No valid action can occur via the spending of an ordinal via transaction fee.
      const brc20 = brc20FromInscription(args.inscription);
      if (brc20) {
        switch (brc20.op) {
          case 'deploy':
            await this.insertBrc20Deploy({
              deploy: brc20,
              inscription_id,
              location: args.location,
            });
            break;
          case 'mint':
            await this.insertBrc20Mint({ mint: brc20, inscription_id, location: args.location });
            break;
          case 'transfer':
            await this.insertBrc20Transfer({
              transfer: brc20,
              inscription_id,
              location: args.location,
            });
            break;
        }
      }
    });
    return inscription_id;
  }

  private async insertInscriptionTransfer(args: {
    location: DbLocationInsert;
  }): Promise<number | undefined> {
    let inscription_id: number | undefined;
    await this.sqlWriteTransaction(async sql => {
      const inscription = await sql<{ id: number }[]>`
        SELECT id FROM inscriptions WHERE genesis_id = ${args.location.genesis_id}
      `;
      if (inscription.count === 0) {
        logger.warn(
          args.location,
          `PgStore ignoring transfer for an inscription that does not exist`
        );
        return;
      }
      inscription_id = inscription[0].id;
      const location = {
        inscription_id,
        block_height: args.location.block_height,
        block_hash: args.location.block_hash,
        tx_id: args.location.tx_id,
        address: args.location.address,
        output: args.location.output,
        offset: args.location.offset,
        prev_output: args.location.prev_output,
        prev_offset: args.location.prev_offset,
        value: args.location.value,
        sat_ordinal: args.location.sat_ordinal,
        sat_rarity: args.location.sat_rarity,
        sat_coinbase_height: args.location.sat_coinbase_height,
        timestamp: sql`to_timestamp(${args.location.timestamp})`,
      };
      await sql`
        INSERT INTO locations ${sql(location)}
        ON CONFLICT ON CONSTRAINT locations_inscription_id_block_height_unique DO UPDATE SET
          block_hash = EXCLUDED.block_hash,
          tx_id = EXCLUDED.tx_id,
          address = EXCLUDED.address,
          output = EXCLUDED.output,
          "offset" = EXCLUDED.offset,
          value = EXCLUDED.value,
          sat_ordinal = EXCLUDED.sat_ordinal,
          sat_rarity = EXCLUDED.sat_rarity,
          sat_coinbase_height = EXCLUDED.sat_coinbase_height,
          timestamp = EXCLUDED.timestamp
      `;

      // Is this a BRC-20 balance transfer? Check if we have a valid transfer inscription emitted by
      // this address that hasn't been sent to another address before.
      const brc20Transfer = await sql<DbBrc20Transfer[]>`
        SELECT ${sql(BRC20_TRANSFERS_COLUMNS.map(c => `t.${c}`))}
        FROM locations AS l
        INNER JOIN brc20_transfers AS t ON t.inscription_id = l.inscription_id 
        WHERE
          l.inscription_id = ${inscription_id}
          AND l.address = ${args.location.address}
          AND l.genesis = TRUE
          AND l.current = TRUE
        LIMIT 1
      `;
      if (brc20Transfer.count > 0) {
        await this.applyBrc20BalanceTransfer({
          transfer: brc20Transfer[0],
          location: args.location,
        });
      }
    });
    return inscription_id;
  }

  // TODO: Roll back BRC20 transfers
  private async rollBackInscriptionGenesis(args: { genesis_id: string }): Promise<void> {
    // This will cascade into dependent tables.
    await this.sql`DELETE FROM inscriptions WHERE genesis_id = ${args.genesis_id}`;
  }

  private async rollBackInscriptionTransfer(args: {
    genesis_id: string;
    output: string;
  }): Promise<number | undefined> {
    let inscription_id: number | undefined;
    await this.sqlWriteTransaction(async sql => {
      const inscription = await sql<{ id: number }[]>`
        SELECT id FROM inscriptions WHERE genesis_id = ${args.genesis_id}
      `;
      if (inscription.count === 0) {
        logger.warn(args, `PgStore ignoring rollback for a transfer that does not exist`);
        return;
      }
      inscription_id = inscription[0].id;
      await sql`
        DELETE FROM locations
        WHERE inscription_id = ${inscription_id} AND output = ${args.output}
      `;
    });
    return inscription_id;
  }

  private async normalizeInscriptionLocations(args: { inscription_id: number[] }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      for (const id of args.inscription_id) {
        await sql`
          WITH i_genesis AS (
            SELECT id FROM locations
            WHERE inscription_id = ${id}
            ORDER BY block_height ASC
            LIMIT 1
          ), i_current AS (
            SELECT id FROM locations
            WHERE inscription_id = ${id}
            ORDER BY block_height DESC
            LIMIT 1
          )
          UPDATE locations SET
            current = (CASE WHEN id = (SELECT id FROM i_current) THEN TRUE ELSE FALSE END),
            genesis = (CASE WHEN id = (SELECT id FROM i_genesis) THEN TRUE ELSE FALSE END)
          WHERE inscription_id = ${id}
        `;
      }
    });
  }

  private async insertBrc20Deploy(args: {
    deploy: Brc20Deploy;
    inscription_id: number;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
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
      // TODO: Maximum supply cannot exceed uint64_max
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

  private async getBrc20Deploy(args: { ticker: string }): Promise<DbBrc20Deploy | undefined> {
    const deploy = await this.sql<DbBrc20Deploy[]>`
      SELECT ${this.sql(BRC20_DEPLOYS_COLUMNS)}
      FROM brc20_deploys
      WHERE LOWER(ticker) = LOWER(${args.ticker})
    `;
    if (deploy.count) return deploy[0];
  }

  private async insertBrc20Mint(args: {
    mint: Brc20Mint;
    inscription_id: number;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Is the token deployed?
      const token = await this.getBrc20Deploy({ ticker: args.mint.tick });
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
      const balance = {
        inscription_id: args.inscription_id,
        brc20_deploy_id: token.id,
        block_height: args.location.block_height,
        address: args.location.address,
        avail_balance: mintAmt, // Real minted balance
        trans_balance: 0,
      };
      await sql`
        INSERT INTO brc20_balances ${sql(balance)}
      `;
    });
  }

  private async insertBrc20Transfer(args: {
    transfer: Brc20Transfer;
    inscription_id: number;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Is the destination a valid address?
      if (!args.location.address) {
        logger.debug(
          `PgStore [BRC-20] ignoring transfer spent as fee for ${args.transfer.tick} at block ${args.location.block_height}`
        );
        return;
      }
      // Is the token deployed?
      const token = await this.getBrc20Deploy({ ticker: args.transfer.tick });
      if (!token) {
        logger.debug(
          `PgStore [BRC-20] ignoring transfer for non-deployed token ${args.transfer.tick} at block ${args.location.block_height}`
        );
        return;
      }
      // Get balance for this address and this token
      const balanceResult = await this.getBrc20Balances({
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
      const values = {
        inscription_id: args.inscription_id,
        brc20_deploy_id: token.id,
        block_height: args.location.block_height,
        address: args.location.address,
        avail_balance: transAmt.negated(),
        trans_balance: transAmt,
      };
      await sql`
        INSERT INTO brc20_balances ${sql(values)}
      `;
    });
  }

  private async applyBrc20BalanceTransfer(args: {
    transfer: DbBrc20Transfer;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Reflect balance transfer
      const amount = new BigNumber(args.transfer.amount);
      const changes = [
        {
          inscription_id: args.transfer.inscription_id,
          brc20_deploy_id: args.transfer.brc20_deploy_id,
          block_height: args.location.block_height,
          address: args.transfer.from_address,
          avail_balance: 0,
          trans_balance: amount.negated(),
        },
        {
          inscription_id: args.transfer.inscription_id,
          brc20_deploy_id: args.transfer.brc20_deploy_id,
          block_height: args.location.block_height,
          address: args.location.address,
          avail_balance: amount,
          trans_balance: 0,
        },
      ];
      await sql`
        INSERT INTO brc20_balances ${sql(changes)}
      `;
      // Keep the new valid owner of the transfer inscription
      await sql`
        UPDATE brc20_transfers
        SET to_address = ${args.location.address}
        WHERE id = ${args.transfer.id}
      `;
    });
  }
}

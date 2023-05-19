import BigNumber from 'bignumber.js';
import { Order, OrderBy } from '../api/schemas';
import { normalizedHexString } from '../api/util/helpers';
import { OrdinalSatoshi, SatoshiRarity } from '../api/util/ordinal-satoshi';
import { ChainhookPayload } from '../chainhook/schemas';
import { ENV } from '../env';
import { logger } from '../logger';
import {
  Brc20Deploy,
  Brc20Mint,
  brc20DeployFromOpJson,
  brc20MintFromOpJson,
  getIndexResultCountType,
  inscriptionContentToJson,
} from './helpers';
import { runMigrations } from './migrations';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';
import {
  DbBrc20DeployInsert,
  DbBrc20Balance,
  DbBrc20Deploy,
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
              const genesis_id = operation.inscription_revealed.inscription_id;
              await this.rollBackInscriptionGenesis({ genesis_id });
              logger.info(`PgStore rollback inscription ${genesis_id}`);
            }
            if (operation.inscription_transferred) {
              const genesis_id = operation.inscription_transferred.inscription_id;
              const satpoint = operation.inscription_transferred.satpoint_post_transfer.split(':');
              const output = `${satpoint[0]}:${satpoint[1]}`;
              const id = await this.rollBackInscriptionTransfer({ genesis_id, output });
              if (id) updatedInscriptionIds.add(id);
              logger.info(`PgStore rollback transfer ${genesis_id} ${output}`);
            }
          }
        }
      }
      for (const event of payload.apply) {
        const block_hash = normalizedHexString(event.block_identifier.hash);
        for (const tx of event.transactions) {
          const tx_id = normalizedHexString(tx.transaction_identifier.hash);
          for (const operation of tx.metadata.ordinal_operations) {
            if (operation.inscription_revealed) {
              const reveal = operation.inscription_revealed;
              const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
              const id = await this.insertInscriptionGenesis({
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
                  block_hash,
                  tx_id,
                  genesis_id: reveal.inscription_id,
                  block_height: event.block_identifier.index,
                  address: reveal.inscriber_address,
                  output: `${tx_id}:0`,
                  offset: reveal.ordinal_offset.toString(),
                  value: reveal.inscription_output_value.toString(),
                  timestamp: event.timestamp,
                  sat_ordinal: reveal.ordinal_number.toString(),
                  sat_rarity: satoshi.rarity,
                  sat_coinbase_height: satoshi.blockHeight,
                },
              });
              if (id) updatedInscriptionIds.add(id);
              logger.info(
                `PgStore apply inscription #${reveal.inscription_number} (${reveal.inscription_id}) at block ${event.block_identifier.index}`
              );
            }
            if (operation.inscription_transferred) {
              const transfer = operation.inscription_transferred;
              const satpoint = transfer.satpoint_post_transfer.split(':');
              const offset = satpoint[2];
              const output = `${satpoint[0]}:${satpoint[1]}`;
              const satoshi = new OrdinalSatoshi(transfer.ordinal_number);
              const id = await this.insertInscriptionTransfer({
                location: {
                  block_hash,
                  tx_id,
                  genesis_id: transfer.inscription_id,
                  block_height: event.block_identifier.index,
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
              if (id) updatedInscriptionIds.add(id);
              logger.info(
                `PgStore apply transfer for #${transfer.inscription_number} (${transfer.inscription_id}) to output ${output} at block ${event.block_identifier.index}`
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
    const result = await this.sql<{ max: string }[]>`SELECT MAX(number) FROM inscriptions`;
    if (result[0].max) {
      return parseInt(result[0].max);
    }
  }

  async getInscriptionTransfersETag(): Promise<string> {
    const result = await this.sql<{ max: number }[]>`SELECT MAX(id) FROM locations`;
    return result[0].max.toString();
  }

  async getInscriptionCurrentLocation(args: { output: string }): Promise<DbLocation | undefined> {
    const result = await this.sql<DbLocation[]>`
      SELECT ${this.sql(LOCATIONS_COLUMNS)}
      FROM locations
      WHERE output = ${args.output}
      AND current = TRUE
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0];
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

  async getBrc20Token(args: { ticker: string }): Promise<DbBrc20Deploy | undefined> {
    const results = await this.sql<DbBrc20Deploy[]>`
      SELECT
        d.id, i.genesis_id, i.number, d.block_height, d.tx_id, d.address, d.ticker, d.max, d.limit,
        d.decimals
      FROM brc20_deploys AS d
      INNER JOIN inscriptions AS i ON i.id = d.inscription_id
      WHERE LOWER(d.ticker) = LOWER(${args.ticker})
      LIMIT 1
    `;
    if (results.count === 1) {
      return results[0];
    }
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
        const maxNumber = await this.getMaxInscriptionNumber();
        if (maxNumber !== undefined && maxNumber + 1 !== args.inscription.number) {
          logger.error(
            {
              block_height: args.location.block_height,
              genesis_id: args.inscription.genesis_id,
            },
            `PgStore inserting out-of-order inscription genesis #${args.inscription.number}, current max is #${maxNumber}`
          );
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
      // TODO: No valid action can occur via the spending of an ordinal via transaction fee. If it
      // occurs during the inscription process then the resulting inscription is ignored. If it
      // occurs during the second phase of the transfer process, the balance is returned to the
      // senders available balance.
      const json = inscriptionContentToJson(args.inscription);
      if (json) {
        // Is this a BRC-20 operation?
        const deploy = brc20DeployFromOpJson(json);
        if (deploy) {
          await this.insertBrc20Deploy({ deploy, inscription_id, location: args.location });
        } else {
          const mint = brc20MintFromOpJson(json);
          if (mint) await this.insertBrc20Mint({ mint, inscription_id, location: args.location });
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
    });
    return inscription_id;
  }

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

  private async insertBrc20Mint(args: {
    mint: Brc20Mint;
    inscription_id: number;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Is the token deployed?
      const deploy = await this.getBrc20Token({ ticker: args.mint.tick });
      if (!deploy) {
        logger.debug(
          `PgStore [BRC-20] ignoring mint for non-deployed token ${args.mint.tick} at block ${args.location.block_height}`
        );
        return;
      }
      // TODO: The first mint to exceed the maximum supply will receive the fraction that is valid.
      // (ex. 21,000,000 maximum supply, 20,999,242 circulating supply, and 1000 mint inscription =
      // 758 balance state applied)

      // Is the mint amount within the allowed token limits?
      if (deploy.limit && BigNumber(args.mint.amt).isGreaterThan(deploy.limit)) {
        logger.debug(
          `PgStore [BRC-20] ignoring mint for ${args.mint.tick} that exceeds mint limit of ${deploy.limit} at block ${args.location.block_height}`
        );
        return;
      }
      const mint = {
        inscription_id: args.inscription_id,
        brc20_deploy_id: deploy.id,
        block_height: args.location.block_height,
        tx_id: args.location.tx_id,
        address: args.location.address,
        amount: args.mint.amt,
      };
      await sql`INSERT INTO brc20_mints ${sql(mint)}`;
      logger.info(
        `PgStore [BRC-20] inserted mint for ${args.mint.tick} (${args.mint.amt}) at block ${args.location.block_height}`
      );

      // Insert balance change for minting address
      const balance = {
        inscription_id: args.inscription_id,
        brc20_deploy_id: deploy.id,
        block_height: args.location.block_height,
        address: args.location.address,
        avail_balance: args.mint.amt,
        trans_balance: 0,
      };
      await sql`
        INSERT INTO brc20_balances ${sql(balance)}
      `;
    });
  }
}

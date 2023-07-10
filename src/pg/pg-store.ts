import { BitcoinEvent, Payload } from '@hirosystems/chainhook-client';
import { Order, OrderBy } from '../api/schemas';
import { isProdEnv, normalizedHexString, parseSatPoint } from '../api/util/helpers';
import { OrdinalSatoshi, SatoshiRarity } from '../api/util/ordinal-satoshi';
import { ENV } from '../env';
import { logger } from '../logger';
import { getIndexResultCountType, inscriptionContentToJson } from './helpers';
import { runMigrations } from './migrations';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';
import {
  DbFullyLocatedInscriptionResult,
  DbInscriptionContent,
  DbInscriptionCountPerBlock,
  DbInscriptionCountPerBlockFilters,
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
  async updateInscriptions(payload: Payload): Promise<void> {
    let updatedBlockHeightMin = Infinity;
    await this.sqlWriteTransaction(async sql => {
      for (const rollbackEvent of payload.rollback) {
        const event = rollbackEvent as BitcoinEvent;
        const block_height = event.block_identifier.index;
        for (const tx of event.transactions) {
          for (const operation of tx.metadata.ordinal_operations) {
            if (operation.inscription_revealed) {
              const number = operation.inscription_revealed.inscription_number;
              const genesis_id = operation.inscription_revealed.inscription_id;
              await this.rollBackInscription({ genesis_id, number, block_height });
            }
            if (operation.cursed_inscription_revealed) {
              const number = operation.cursed_inscription_revealed.inscription_number;
              const genesis_id = operation.cursed_inscription_revealed.inscription_id;
              await this.rollBackInscription({ genesis_id, number, block_height });
            }
            if (operation.inscription_transferred) {
              const genesis_id = operation.inscription_transferred.inscription_id;
              const satpoint = parseSatPoint(
                operation.inscription_transferred.satpoint_post_transfer
              );
              const output = `${satpoint.tx_id}:${satpoint.vout}`;
              await this.rollBackLocation({ genesis_id, output, block_height });
            }
          }
        }
        updatedBlockHeightMin = Math.min(updatedBlockHeightMin, event.block_identifier.index);
      }
      for (const applyEvent of payload.apply) {
        const event = applyEvent as BitcoinEvent;
        const block_height = event.block_identifier.index;
        const block_hash = normalizedHexString(event.block_identifier.hash);
        for (const tx of event.transactions) {
          const tx_id = normalizedHexString(tx.transaction_identifier.hash);
          for (const operation of tx.metadata.ordinal_operations) {
            if (operation.inscription_revealed) {
              const reveal = operation.inscription_revealed;
              const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
              const satpoint = parseSatPoint(reveal.satpoint_post_inscription);
              await this.insertInscription({
                inscription: {
                  genesis_id: reveal.inscription_id,
                  mime_type: reveal.content_type.split(';')[0],
                  content_type: reveal.content_type,
                  content_length: reveal.content_length,
                  number: reveal.inscription_number,
                  content: reveal.content_bytes,
                  fee: reveal.inscription_fee.toString(),
                  curse_type: null,
                  sat_ordinal: reveal.ordinal_number.toString(),
                  sat_rarity: satoshi.rarity,
                  sat_coinbase_height: satoshi.blockHeight,
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
                },
              });
            }
            if (operation.cursed_inscription_revealed) {
              const reveal = operation.cursed_inscription_revealed;
              const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
              const satpoint = parseSatPoint(reveal.satpoint_post_inscription);
              await this.insertInscription({
                inscription: {
                  genesis_id: reveal.inscription_id,
                  mime_type: reveal.content_type.split(';')[0],
                  content_type: reveal.content_type,
                  content_length: reveal.content_length,
                  number: reveal.inscription_number,
                  content: reveal.content_bytes,
                  fee: reveal.inscription_fee.toString(),
                  curse_type: JSON.stringify(reveal.curse_type),
                  sat_ordinal: reveal.ordinal_number.toString(),
                  sat_rarity: satoshi.rarity,
                  sat_coinbase_height: satoshi.blockHeight,
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
                },
              });
            }
            if (operation.inscription_transferred) {
              const transfer = operation.inscription_transferred;
              const satpoint = parseSatPoint(transfer.satpoint_post_transfer);
              const prevSatpoint = parseSatPoint(transfer.satpoint_pre_transfer);
              await this.insertLocation({
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
                },
              });
            }
          }
        }
        updatedBlockHeightMin = Math.min(updatedBlockHeightMin, event.block_identifier.index);
      }
    });
    await this.refreshMaterializedView('chain_tip');
    // Skip expensive view refreshes if we're not streaming any live blocks yet.
    if (payload.chainhook.is_streaming_blocks) {
      await this.normalizeInscriptionCount({ min_block_height: updatedBlockHeightMin });
      await this.refreshMaterializedView('inscription_count');
      await this.refreshMaterializedView('mime_type_counts');
      await this.refreshMaterializedView('sat_rarity_counts');
    }
  }

  async getChainTipBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: string }[]>`SELECT block_height FROM chain_tip`;
    return parseInt(result[0].block_height);
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
      SELECT COALESCE(SUM(count), 0) AS count
      FROM mime_type_counts
      WHERE mime_type IN ${this.sql(mimeType)}
    `;
    return result[0].count;
  }

  async geSatRarityInscriptionCount(satRarity?: SatoshiRarity[]): Promise<number> {
    if (!satRarity) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT COALESCE(SUM(count), 0) AS count
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

  async getInscriptionsPerBlockETag(): Promise<string> {
    const result = await this.sql<{ block_hash: string; inscription_count: string }[]>`
      SELECT block_hash, inscription_count
      FROM inscriptions_per_block
      ORDER BY block_height DESC
      LIMIT 1
    `;
    return `${result[0].block_hash}:${result[0].inscription_count}`;
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
      INNER JOIN current_locations AS c ON l.id = c.location_id
      INNER JOIN inscriptions AS i ON l.inscription_id = i.id
      WHERE ${
        'genesis_id' in args
          ? this.sql`i.genesis_id = ${args.genesis_id}`
          : this.sql`i.number = ${args.number}`
      }
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
          orderBy = sql`i.sat_ordinal`;
          break;
        case OrderBy.rarity:
          orderBy = sql`ARRAY_POSITION(ARRAY['common','uncommon','rare','epic','legendary','mythic'], i.sat_rarity)`;
          break;
      }
      // `ORDER` statement
      const order = sort?.order === Order.asc ? sql`ASC` : sql`DESC`;
      const results = await sql<({ total: number } & DbFullyLocatedInscriptionResult)[]>`
        WITH gen_locations AS (
          SELECT l.* FROM locations AS l
          INNER JOIN genesis_locations AS g ON l.id = g.location_id
        ),
        cur_locations AS (
          SELECT l.* FROM locations AS l
          INNER JOIN current_locations AS c ON l.id = c.location_id
        )
        SELECT
          i.genesis_id,
          i.number,
          i.mime_type,
          i.content_type,
          i.content_length,
          i.fee AS genesis_fee,
          i.curse_type,
          i.sat_ordinal,
          i.sat_rarity,
          i.sat_coinbase_height,
          gen.block_height AS genesis_block_height,
          gen.block_hash AS genesis_block_hash,
          gen.tx_id AS genesis_tx_id,
          gen.timestamp AS genesis_timestamp,
          gen.address AS genesis_address,
          loc.tx_id,
          loc.address,
          loc.output,
          loc.offset,
          loc.timestamp,
          loc.value,
          ${
            countType === DbInscriptionIndexResultCountType.custom
              ? sql`COUNT(*) OVER() as total`
              : sql`0 as total`
          }
        FROM inscriptions AS i
        INNER JOIN cur_locations AS loc ON loc.inscription_id = i.id
        INNER JOIN gen_locations AS gen ON gen.inscription_id = i.id
        WHERE TRUE
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
              ? sql`AND i.sat_coinbase_height >= ${filters.from_sat_coinbase_height}`
              : sql``
          }
          ${
            filters?.to_sat_coinbase_height
              ? sql`AND i.sat_coinbase_height <= ${filters.to_sat_coinbase_height}`
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
              ? sql`AND i.sat_ordinal >= ${filters.from_sat_ordinal}`
              : sql``
          }
          ${filters?.to_sat_ordinal ? sql`AND i.sat_ordinal <= ${filters.to_sat_ordinal}` : sql``}
          ${filters?.number?.length ? sql`AND i.number IN ${sql(filters.number)}` : sql``}
          ${filters?.from_number ? sql`AND i.number >= ${filters.from_number}` : sql``}
          ${filters?.to_number ? sql`AND i.number <= ${filters.to_number}` : sql``}
          ${filters?.address?.length ? sql`AND loc.address IN ${sql(filters.address)}` : sql``}
          ${filters?.mime_type?.length ? sql`AND i.mime_type IN ${sql(filters.mime_type)}` : sql``}
          ${filters?.output ? sql`AND loc.output = ${filters.output}` : sql``}
          ${
            filters?.sat_rarity?.length
              ? sql`AND i.sat_rarity IN ${sql(filters.sat_rarity)}`
              : sql``
          }
          ${filters?.sat_ordinal ? sql`AND i.sat_ordinal = ${filters.sat_ordinal}` : sql``}
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
          total = await this.geSatRarityInscriptionCount(filters?.sat_rarity);
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
          NOT EXISTS (SELECT location_id FROM genesis_locations WHERE location_id = l.id)
          AND
          ${
            'block_height' in args
              ? this.sql`l.block_height = ${args.block_height}`
              : this.sql`l.block_hash = ${args.block_hash}`
          }
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

  async getInscriptionCountPerBlock(
    filters: DbInscriptionCountPerBlockFilters
  ): Promise<DbInscriptionCountPerBlock[]> {
    const fromCondition = filters.from_block_height
      ? this.sql`block_height >= ${filters.from_block_height}`
      : this.sql``;

    const toCondition = filters.to_block_height
      ? this.sql`block_height <= ${filters.to_block_height}`
      : this.sql``;

    const where =
      filters.from_block_height && filters.to_block_height
        ? this.sql`WHERE ${fromCondition} AND ${toCondition}`
        : this.sql`WHERE ${fromCondition}${toCondition}`;

    return await this.sql<DbInscriptionCountPerBlock[]>`
      SELECT *
      FROM inscriptions_per_block
      ${filters.from_block_height || filters.to_block_height ? where : this.sql``}
      ORDER BY block_height DESC
      LIMIT 5000
    `; // roughly 35 days of blocks, assuming 10 minute block times on a full database
  }

  async refreshMaterializedView(viewName: string) {
    await this.sql`REFRESH MATERIALIZED VIEW ${
      isProdEnv ? this.sql`CONCURRENTLY` : this.sql``
    } ${this.sql(viewName)}`;
  }

  private async insertInscription(args: {
    inscription: DbInscriptionInsert;
    location: DbLocationInsert;
  }): Promise<number | undefined> {
    let inscription_id: number | undefined;
    await this.sqlWriteTransaction(async sql => {
      const upsert = await sql<{ id: number }[]>`
        SELECT id FROM inscriptions WHERE number = ${args.inscription.number}
      `;
      const inscription = await sql<{ id: number }[]>`
        INSERT INTO inscriptions ${sql(args.inscription)}
        ON CONFLICT ON CONSTRAINT inscriptions_number_unique DO UPDATE SET
          genesis_id = EXCLUDED.genesis_id,
          mime_type = EXCLUDED.mime_type,
          content_type = EXCLUDED.content_type,
          content_length = EXCLUDED.content_length,
          content = EXCLUDED.content,
          fee = EXCLUDED.fee,
          sat_ordinal = EXCLUDED.sat_ordinal,
          sat_rarity = EXCLUDED.sat_rarity,
          sat_coinbase_height = EXCLUDED.sat_coinbase_height
        RETURNING id
      `;
      inscription_id = inscription[0].id;
      const location = {
        inscription_id,
        genesis_id: args.location.genesis_id,
        block_height: args.location.block_height,
        block_hash: args.location.block_hash,
        tx_id: args.location.tx_id,
        address: args.location.address,
        output: args.location.output,
        offset: args.location.offset,
        prev_output: args.location.prev_output,
        prev_offset: args.location.prev_offset,
        value: args.location.value,
        timestamp: sql`to_timestamp(${args.location.timestamp})`,
      };
      const locationRes = await sql<{ id: string }[]>`
        INSERT INTO locations ${sql(location)}
        ON CONFLICT ON CONSTRAINT locations_output_offset_unique DO UPDATE SET
          inscription_id = EXCLUDED.inscription_id,
          genesis_id = EXCLUDED.genesis_id,
          block_height = EXCLUDED.block_height,
          block_hash = EXCLUDED.block_hash,
          tx_id = EXCLUDED.tx_id,
          address = EXCLUDED.address,
          value = EXCLUDED.value,
          timestamp = EXCLUDED.timestamp
        RETURNING id
      `;
      await this.updateInscriptionLocationPointers({
        inscription_id,
        genesis_id: args.inscription.genesis_id,
        location_id: locationRes[0].id,
        block_height: args.location.block_height,
      });
      logger.info(
        `PgStore${upsert.count > 0 ? ' upsert ' : ' '}reveal #${args.inscription.number} (${
          args.location.genesis_id
        }) at block ${args.location.block_height}`
      );
    });
    return inscription_id;
  }

  private async insertLocation(args: { location: DbLocationInsert }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Does the inscription exist? Warn if it doesn't.
      const genesis = await sql<{ id: number }[]>`
        SELECT id FROM inscriptions WHERE genesis_id = ${args.location.genesis_id}
      `;
      if (genesis.count === 0) {
        logger.warn(
          `PgStore inserting transfer for missing inscription (${args.location.genesis_id}) at block ${args.location.block_height}`
        );
      }
      const inscription_id = genesis.count > 0 ? genesis[0].id : null;
      // Do we have the location from `prev_output`? Warn if we don't.
      if (args.location.prev_output) {
        const prev = await sql`
          SELECT id FROM locations
          WHERE genesis_id = ${args.location.genesis_id}
            AND prev_output = ${args.location.prev_output}
        `;
        if (prev.count === 0) {
          logger.warn(
            `PgStore inserting transfer (${args.location.genesis_id}) superceding a missing prev_output ${args.location.prev_output} at block ${args.location.block_height}`
          );
        }
      }
      const upsert = await sql`
        SELECT id FROM locations
        WHERE genesis_id = ${args.location.genesis_id}
        AND block_height = ${args.location.block_height}
      `;
      const location = {
        inscription_id,
        genesis_id: args.location.genesis_id,
        block_height: args.location.block_height,
        block_hash: args.location.block_hash,
        tx_id: args.location.tx_id,
        address: args.location.address,
        output: args.location.output,
        offset: args.location.offset,
        prev_output: args.location.prev_output,
        prev_offset: args.location.prev_offset,
        value: args.location.value,
        timestamp: this.sql`to_timestamp(${args.location.timestamp})`,
      };
      const locationRes = await sql<{ id: string }[]>`
        INSERT INTO locations ${sql(location)}
        ON CONFLICT ON CONSTRAINT locations_output_offset_unique DO UPDATE SET
          inscription_id = EXCLUDED.inscription_id,
          genesis_id = EXCLUDED.genesis_id,
          block_height = EXCLUDED.block_height,
          block_hash = EXCLUDED.block_hash,
          tx_id = EXCLUDED.tx_id,
          address = EXCLUDED.address,
          value = EXCLUDED.value,
          timestamp = EXCLUDED.timestamp
        RETURNING id
      `;
      if (inscription_id) {
        await this.updateInscriptionLocationPointers({
          inscription_id,
          genesis_id: args.location.genesis_id,
          location_id: locationRes[0].id,
          block_height: args.location.block_height,
        });
      }
      logger.info(
        `PgStore${upsert.count > 0 ? ' upsert ' : ' '}transfer (${
          args.location.genesis_id
        }) at block ${args.location.block_height}`
      );
    });
  }

  private async normalizeInscriptionCount(args: { min_block_height: number }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      await sql`
        DELETE FROM inscriptions_per_block
        WHERE block_height >= ${args.min_block_height}
      `;
      // - gets highest total for a block < min_block_height
      // - calculates new totals for all blocks >= min_block_height
      // - inserts new totals
      await sql`
        WITH previous AS (
          SELECT *
          FROM inscriptions_per_block
          WHERE block_height < ${args.min_block_height}
          ORDER BY block_height DESC
          LIMIT 1
        ), updated_blocks AS (
          SELECT
            l.block_height,
            MIN(l.block_hash),
            COUNT(*) AS inscription_count,
            COALESCE((SELECT previous.inscription_count_accum FROM previous), 0) + (SUM(COUNT(*)) OVER (ORDER BY l.block_height ASC)) AS inscription_count_accum,
            MIN(l.timestamp)
          FROM locations AS l
          INNER JOIN genesis_locations AS g ON g.location_id = l.id
          WHERE l.block_height >= ${args.min_block_height}
          GROUP BY l.block_height
          ORDER BY l.block_height ASC
        )
        INSERT INTO inscriptions_per_block
        SELECT * FROM updated_blocks
        ON CONFLICT (block_height) DO UPDATE SET
          block_hash = EXCLUDED.block_hash,
          inscription_count = EXCLUDED.inscription_count,
          inscription_count_accum = EXCLUDED.inscription_count_accum,
          timestamp = EXCLUDED.timestamp;
      `;
    });
  }

  private async rollBackInscription(args: {
    genesis_id: string;
    number: number;
    block_height: number;
  }): Promise<void> {
    // This will cascade into dependent tables.
    await this.sql`DELETE FROM inscriptions WHERE genesis_id = ${args.genesis_id}`;
    logger.info(
      `PgStore rollback reveal #${args.number} (${args.genesis_id}) at block ${args.block_height}`
    );
  }

  private async rollBackLocation(args: {
    genesis_id: string;
    output: string;
    block_height: number;
  }): Promise<void> {
    await this.sql`
      DELETE FROM locations
      WHERE genesis_id = ${args.genesis_id} AND output = ${args.output}
    `;
    logger.info(
      `PgStore rollback transfer (${args.genesis_id}) on output ${args.output} at block ${args.block_height}`
    );
  }

  private async updateInscriptionLocationPointers(args: {
    inscription_id: number;
    genesis_id: string;
    location_id: string;
    block_height: number;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Update genesis and current location pointers for this inscription.
      const pointer = {
        inscription_id: args.inscription_id,
        location_id: args.location_id,
        block_height: args.block_height,
      };
      await sql`
        INSERT INTO genesis_locations ${sql(pointer)}
        ON CONFLICT ON CONSTRAINT genesis_locations_inscription_id_unique DO UPDATE SET
          location_id = EXCLUDED.location_id,
          block_height = EXCLUDED.block_height
        WHERE EXCLUDED.block_height < genesis_locations.block_height
      `;
      await sql`
        INSERT INTO current_locations ${sql(pointer)}
        ON CONFLICT ON CONSTRAINT current_locations_inscription_id_unique DO UPDATE SET
          location_id = EXCLUDED.location_id,
          block_height = EXCLUDED.block_height
        WHERE EXCLUDED.block_height > current_locations.block_height
      `;
      // Backfill orphan locations for this inscription, if any.
      await sql`
        UPDATE locations
        SET inscription_id = ${args.inscription_id}
        WHERE genesis_id = ${args.genesis_id} AND inscription_id IS NULL
      `;
    });
  }
}

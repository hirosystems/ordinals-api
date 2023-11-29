import {
  BasePgStore,
  PgConnectionVars,
  PgSqlClient,
  PgSqlQuery,
  batchIterate,
  connectPostgres,
  logger,
  runMigrations,
} from '@hirosystems/api-toolkit';
import { BitcoinEvent, Payload } from '@hirosystems/chainhook-client';
import * as path from 'path';
import * as postgres from 'postgres';
import { Order, OrderBy } from '../api/schemas';
import { normalizedHexString, parseSatPoint } from '../api/util/helpers';
import { OrdinalSatoshi } from '../api/util/ordinal-satoshi';
import { ENV } from '../env';
import { Brc20PgStore } from './brc20/brc20-pg-store';
import { CountsPgStore } from './counts/counts-pg-store';
import { getIndexResultCountType } from './counts/helpers';
import { assertNoBlockInscriptionGap, getInscriptionRecursion, removeNullBytes } from './helpers';
import {
  DbFullyLocatedInscriptionResult,
  DbInscription,
  DbInscriptionContent,
  DbInscriptionCountPerBlock,
  DbInscriptionCountPerBlockFilters,
  DbInscriptionIndexFilters,
  DbInscriptionIndexOrder,
  DbInscriptionIndexPaging,
  DbInscriptionInsert,
  DbInscriptionLocationChange,
  DbLocation,
  DbLocationPointer,
  DbLocationPointerInsert,
  DbLocationTransferType,
  DbPaginatedResult,
  DbRevealInsert,
  INSCRIPTIONS_COLUMNS,
  LOCATIONS_COLUMNS,
} from './types';
import { toEnumValue } from '@hirosystems/api-toolkit';

export const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
export const ORDINALS_GENESIS_BLOCK = 767430;

type InscriptionIdentifier = { genesis_id: string } | { number: number };

export class PgStore extends BasePgStore {
  readonly brc20: Brc20PgStore;
  readonly counts: CountsPgStore;

  static async connect(opts?: { skipMigrations: boolean }): Promise<PgStore> {
    const pgConfig: PgConnectionVars = {
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
        statementTimeout: ENV.PG_STATEMENT_TIMEOUT,
      },
    });
    if (opts?.skipMigrations !== true) {
      await runMigrations(MIGRATIONS_DIR, 'up');
    }
    return new PgStore(sql);
  }

  constructor(sql: PgSqlClient) {
    super(sql);
    this.brc20 = new Brc20PgStore(this);
    this.counts = new CountsPgStore(this);
  }

  /**
   * Inserts inscription genesis and transfers from Chainhook events. Also handles rollbacks from
   * chain re-orgs and materialized view refreshes.
   * @param args - Apply/Rollback Chainhook events
   */
  async updateInscriptions(payload: Payload): Promise<void> {
    let updatedBlockHeightMin = Infinity;
    await this.sqlWriteTransaction(async sql => {
      // Check where we're at in terms of ingestion, e.g. block height and max blessed inscription
      // number. This will let us determine if we should skip ingesting this block or throw an error
      // if a gap is detected.
      const currentBlessedNumber = (await this.getMaxInscriptionNumber()) ?? -1;
      const currentBlockHeight = await this.getChainTipBlockHeight();
      const newBlessedNumbers: number[] = [];

      for (const rollbackEvent of payload.rollback) {
        // TODO: Optimize rollbacks just as we optimized applys.
        const event = rollbackEvent as BitcoinEvent;
        const block_height = event.block_identifier.index;
        for (const tx of event.transactions) {
          for (const operation of tx.metadata.ordinal_operations) {
            if (operation.inscription_revealed) {
              const number = operation.inscription_revealed.inscription_number;
              const genesis_id = operation.inscription_revealed.inscription_id;
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

      let blockTransferIndex = 0;
      for (const applyEvent of payload.apply) {
        const event = applyEvent as BitcoinEvent;
        const block_height = event.block_identifier.index;
        if (
          ENV.INSCRIPTION_GAP_DETECTION_ENABLED &&
          block_height <= currentBlockHeight &&
          block_height !== ORDINALS_GENESIS_BLOCK
        ) {
          logger.info(
            `PgStore skipping ingestion for previously seen block ${block_height}, current chain tip is at ${currentBlockHeight}`
          );
          return;
        }
        const block_hash = normalizedHexString(event.block_identifier.hash);
        const writes: DbRevealInsert[] = [];
        for (const tx of event.transactions) {
          const tx_id = normalizedHexString(tx.transaction_identifier.hash);
          for (const operation of tx.metadata.ordinal_operations) {
            if (operation.inscription_revealed) {
              const reveal = operation.inscription_revealed;
              if (reveal.inscription_number >= 0)
                newBlessedNumbers.push(parseInt(`${reveal.inscription_number}`));
              const satoshi = new OrdinalSatoshi(reveal.ordinal_number);
              const satpoint = parseSatPoint(reveal.satpoint_post_inscription);
              const recursive_refs = getInscriptionRecursion(reveal.content_bytes);
              const contentType = removeNullBytes(reveal.content_type);
              writes.push({
                inscription: {
                  genesis_id: reveal.inscription_id,
                  mime_type: contentType.split(';')[0],
                  content_type: contentType,
                  content_length: reveal.content_length,
                  number: reveal.inscription_number,
                  content: removeNullBytes(reveal.content_bytes),
                  fee: reveal.inscription_fee.toString(),
                  curse_type: reveal.curse_type ? JSON.stringify(reveal.curse_type) : null,
                  sat_ordinal: reveal.ordinal_number.toString(),
                  sat_rarity: satoshi.rarity,
                  sat_coinbase_height: satoshi.blockHeight,
                  recursive: recursive_refs.length > 0,
                },
                location: {
                  block_hash,
                  block_height,
                  tx_id,
                  tx_index: reveal.tx_index,
                  block_transfer_index: null,
                  genesis_id: reveal.inscription_id,
                  address: reveal.inscriber_address,
                  output: `${satpoint.tx_id}:${satpoint.vout}`,
                  offset: satpoint.offset ?? null,
                  prev_output: null,
                  prev_offset: null,
                  value: reveal.inscription_output_value.toString(),
                  timestamp: event.timestamp,
                  transfer_type: DbLocationTransferType.transferred,
                },
                recursive_refs,
              });
            }
            if (operation.inscription_transferred) {
              const transfer = operation.inscription_transferred;
              const satpoint = parseSatPoint(transfer.satpoint_post_transfer);
              const prevSatpoint = parseSatPoint(transfer.satpoint_pre_transfer);
              writes.push({
                location: {
                  block_hash,
                  block_height,
                  tx_id,
                  tx_index: transfer.tx_index,
                  block_transfer_index: blockTransferIndex++,
                  genesis_id: transfer.inscription_id,
                  address: transfer.destination.value ?? null,
                  output: `${satpoint.tx_id}:${satpoint.vout}`,
                  offset: satpoint.offset ?? null,
                  prev_output: `${prevSatpoint.tx_id}:${prevSatpoint.vout}`,
                  prev_offset: prevSatpoint.offset ?? null,
                  value: transfer.post_transfer_output_value
                    ? transfer.post_transfer_output_value.toString()
                    : null,
                  timestamp: event.timestamp,
                  transfer_type:
                    toEnumValue(DbLocationTransferType, transfer.destination.type) ??
                    DbLocationTransferType.transferred,
                },
              });
            }
          }
        }
        assertNoBlockInscriptionGap({
          currentNumber: currentBlessedNumber,
          newNumbers: newBlessedNumbers,
          currentBlockHeight: currentBlockHeight,
          newBlockHeight: block_height,
        });
        // Divide insertion array into chunks of 4000 in order to avoid the postgres limit of 65534
        // query params.
        for (const writeChunk of batchIterate(writes, 4000))
          await this.insertInscriptions(writeChunk);
        updatedBlockHeightMin = Math.min(updatedBlockHeightMin, event.block_identifier.index);
        if (ENV.BRC20_BLOCK_SCAN_ENABLED)
          await this.brc20.scanBlocks(event.block_identifier.index, event.block_identifier.index);
      }
    });
    await this.refreshMaterializedView('chain_tip');
    if (updatedBlockHeightMin !== Infinity)
      await this.normalizeInscriptionCount({ min_block_height: updatedBlockHeightMin });
  }

  async getChainTipBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: string }[]>`SELECT block_height FROM chain_tip`;
    return parseInt(result[0].block_height);
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

  async getInscriptionsIndexETag(): Promise<string> {
    const result = await this.sql<{ etag: string }[]>`
      SELECT date_part('epoch', MAX(updated_at))::text AS etag FROM inscriptions
    `;
    return result[0].etag;
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
      SELECT date_part('epoch', updated_at)::text AS etag
      FROM inscriptions
      WHERE ${
        'genesis_id' in args
          ? this.sql`genesis_id = ${args.genesis_id}`
          : this.sql`number = ${args.number}`
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
      const order = sort?.order === Order.asc ? sql`ASC` : sql`DESC`;
      let orderBy = sql`i.number ${order}`;
      switch (sort?.order_by) {
        case OrderBy.genesis_block_height:
          orderBy = sql`gen.block_height ${order}, gen.tx_index ${order}`;
          break;
        case OrderBy.ordinal:
          orderBy = sql`i.sat_ordinal ${order}`;
          break;
        case OrderBy.rarity:
          orderBy = sql`ARRAY_POSITION(ARRAY['common','uncommon','rare','epic','legendary','mythic'], i.sat_rarity) ${order}, i.number DESC`;
          break;
      }
      // This function will generate a query to be used for getting results or total counts.
      const query = (
        columns: postgres.PendingQuery<postgres.Row[]>,
        sorting: postgres.PendingQuery<postgres.Row[]>
      ) => sql`
        SELECT ${columns}
        FROM inscriptions AS i
        INNER JOIN current_locations AS cur ON cur.inscription_id = i.id
        INNER JOIN locations AS cur_l ON cur_l.id = cur.location_id
        INNER JOIN genesis_locations AS gen ON gen.inscription_id = i.id
        INNER JOIN locations AS gen_l ON gen_l.id = gen.location_id
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
              ? sql`AND gen_l.block_hash = ${filters.genesis_block_hash}`
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
              ? sql`AND gen_l.timestamp >= to_timestamp(${filters.from_genesis_timestamp})`
              : sql``
          }
          ${
            filters?.to_genesis_timestamp
              ? sql`AND gen_l.timestamp <= to_timestamp(${filters.to_genesis_timestamp})`
              : sql``
          }
          ${
            filters?.from_sat_ordinal
              ? sql`AND i.sat_ordinal >= ${filters.from_sat_ordinal}`
              : sql``
          }
          ${filters?.to_sat_ordinal ? sql`AND i.sat_ordinal <= ${filters.to_sat_ordinal}` : sql``}
          ${filters?.number?.length ? sql`AND i.number IN ${sql(filters.number)}` : sql``}
          ${
            filters?.from_number !== undefined ? sql`AND i.number >= ${filters.from_number}` : sql``
          }
          ${filters?.to_number !== undefined ? sql`AND i.number <= ${filters.to_number}` : sql``}
          ${filters?.address?.length ? sql`AND cur.address IN ${sql(filters.address)}` : sql``}
          ${filters?.mime_type?.length ? sql`AND i.mime_type IN ${sql(filters.mime_type)}` : sql``}
          ${filters?.output ? sql`AND cur_l.output = ${filters.output}` : sql``}
          ${
            filters?.sat_rarity?.length
              ? sql`AND i.sat_rarity IN ${sql(filters.sat_rarity)}`
              : sql``
          }
          ${filters?.sat_ordinal ? sql`AND i.sat_ordinal = ${filters.sat_ordinal}` : sql``}
          ${filters?.recursive !== undefined ? sql`AND i.recursive = ${filters.recursive}` : sql``}
          ${filters?.cursed === true ? sql`AND i.number < 0` : sql``}
          ${filters?.cursed === false ? sql`AND i.number >= 0` : sql``}
          ${
            filters?.genesis_address?.length
              ? sql`AND gen.address IN ${sql(filters.genesis_address)}`
              : sql``
          }
        ${sorting}
      `;
      const results = await sql<DbFullyLocatedInscriptionResult[]>`${query(
        sql`
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
          i.recursive,
          (
            SELECT STRING_AGG(ii.genesis_id, ',')
            FROM inscription_recursions AS ir
            INNER JOIN inscriptions AS ii ON ii.id = ir.ref_inscription_id
            WHERE ir.inscription_id = i.id
          ) AS recursion_refs,
          gen.block_height AS genesis_block_height,
          gen_l.block_hash AS genesis_block_hash,
          gen_l.tx_id AS genesis_tx_id,
          gen_l.timestamp AS genesis_timestamp,
          gen.address AS genesis_address,
          cur_l.tx_id,
          cur.address,
          cur_l.output,
          cur_l.offset,
          cur_l.timestamp,
          cur_l.value
        `,
        sql`ORDER BY ${orderBy} LIMIT ${page.limit} OFFSET ${page.offset}`
      )}`;
      // Do we need a filtered `COUNT(*)`? If so, try to use the pre-calculated counts we have in
      // cached tables to speed up these queries.
      const countType = getIndexResultCountType(filters);
      let total = await this.counts.fromResults(countType, filters);
      if (total === undefined) {
        // If the count is more complex, attempt it with a separate query.
        const count = await sql<{ total: number }[]>`${query(sql`COUNT(*) AS total`, sql``)}`;
        total = count[0].total;
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
      SELECT ${this.sql(LOCATIONS_COLUMNS)}, COUNT(*) OVER() as total
      FROM locations
      WHERE genesis_id = (
        SELECT genesis_id FROM inscriptions
        WHERE ${
          'number' in args
            ? this.sql`number = ${args.number}`
            : this.sql`genesis_id = ${args.genesis_id}`
        }
        LIMIT 1
      )
      ORDER BY block_height DESC, tx_index DESC
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
      WITH max_transfer_index AS (
        SELECT MAX(block_transfer_index) FROM locations WHERE ${
          'block_height' in args
            ? this.sql`block_height = ${args.block_height}`
            : this.sql`block_hash = ${args.block_hash}`
        } AND block_transfer_index IS NOT NULL
      ),
      transfers AS (
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
              AND (
                ll.block_height < l.block_height OR
                (ll.block_height = l.block_height AND ll.tx_index < l.tx_index)
              )
            ORDER BY ll.block_height DESC
            LIMIT 1
          ) AS from_id
        FROM locations AS l
        INNER JOIN inscriptions AS i ON l.inscription_id = i.id
        WHERE
          ${
            'block_height' in args
              ? this.sql`l.block_height = ${args.block_height}`
              : this.sql`l.block_hash = ${args.block_hash}`
          }
          AND l.block_transfer_index IS NOT NULL
          AND l.block_transfer_index <= ((SELECT max FROM max_transfer_index) - ${args.offset}::int)
          AND l.block_transfer_index >
            ((SELECT max FROM max_transfer_index) - (${args.offset}::int + ${args.limit}::int))
      )
      SELECT
        t.genesis_id,
        t.number,
        (SELECT max FROM max_transfer_index) + 1 AS total,
        ${this.sql.unsafe(LOCATIONS_COLUMNS.map(c => `lf.${c} AS from_${c}`).join(','))},
        ${this.sql.unsafe(LOCATIONS_COLUMNS.map(c => `lt.${c} AS to_${c}`).join(','))}
      FROM transfers AS t
      INNER JOIN locations AS lf ON t.from_id = lf.id
      INNER JOIN locations AS lt ON t.to_id = lt.id
      ORDER BY lt.block_transfer_index DESC
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
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

  private async getInscription(args: { genesis_id: string }): Promise<DbInscription | undefined> {
    const query = await this.sql<DbInscription[]>`
      SELECT ${this.sql(INSCRIPTIONS_COLUMNS)}
      FROM inscriptions
      WHERE genesis_id = ${args.genesis_id}
    `;
    if (query.count === 0) return;
    return query[0];
  }

  private async getLocation(args: {
    genesis_id: string;
    output: string;
  }): Promise<DbLocation | undefined> {
    const query = await this.sql<DbLocation[]>`
      SELECT ${this.sql(LOCATIONS_COLUMNS)}
      FROM locations
      WHERE genesis_id = ${args.genesis_id} AND output = ${args.output}
    `;
    if (query.count === 0) return;
    return query[0];
  }

  private async insertInscriptions(writes: DbRevealInsert[]): Promise<void> {
    if (writes.length === 0) return;
    await this.sqlWriteTransaction(async sql => {
      const inscriptions: DbInscriptionInsert[] = [];
      const transferGenesisIds = new Set<string>();
      for (const r of writes)
        if (r.inscription) inscriptions.push(r.inscription);
        else transferGenesisIds.add(r.location.genesis_id);
      if (inscriptions.length)
        await sql`
          INSERT INTO inscriptions ${sql(inscriptions)}
          ON CONFLICT ON CONSTRAINT inscriptions_number_unique DO UPDATE SET
            genesis_id = EXCLUDED.genesis_id,
            mime_type = EXCLUDED.mime_type,
            content_type = EXCLUDED.content_type,
            content_length = EXCLUDED.content_length,
            content = EXCLUDED.content,
            fee = EXCLUDED.fee,
            sat_ordinal = EXCLUDED.sat_ordinal,
            sat_rarity = EXCLUDED.sat_rarity,
            sat_coinbase_height = EXCLUDED.sat_coinbase_height,
            updated_at = NOW()
        `;
      const locationData = writes.map(i => ({
        ...i.location,
        inscription_id: sql`(SELECT id FROM inscriptions WHERE genesis_id = ${i.location.genesis_id} LIMIT 1)`,
        timestamp: sql`TO_TIMESTAMP(${i.location.timestamp})`,
      }));
      const locations = await sql<DbLocationPointerInsert[]>`
        INSERT INTO locations ${sql(locationData)}
        ON CONFLICT ON CONSTRAINT locations_inscription_id_block_height_tx_index_unique DO UPDATE SET
          genesis_id = EXCLUDED.genesis_id,
          block_hash = EXCLUDED.block_hash,
          tx_id = EXCLUDED.tx_id,
          address = EXCLUDED.address,
          value = EXCLUDED.value,
          output = EXCLUDED.output,
          "offset" = EXCLUDED.offset,
          timestamp = EXCLUDED.timestamp
        RETURNING inscription_id, id AS location_id, block_height, tx_index, address
      `;
      await this.updateInscriptionRecursions(writes);
      if (transferGenesisIds.size)
        await sql`
          UPDATE inscriptions
          SET updated_at = NOW()
          WHERE genesis_id IN ${sql([...transferGenesisIds])}
        `;
      await this.updateInscriptionLocationPointers(locations);
      await this.counts.applyInscriptions(inscriptions);
      for (const reveal of writes) {
        const action = reveal.inscription ? `reveal #${reveal.inscription.number}` : `transfer`;
        logger.info(
          `PgStore ${action} (${reveal.location.genesis_id}) at block ${reveal.location.block_height}`
        );
      }
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
    const inscription = await this.getInscription({ genesis_id: args.genesis_id });
    if (!inscription) return;
    await this.sqlWriteTransaction(async sql => {
      await this.counts.rollBackInscription({ inscription });
      await this.brc20.rollBackInscription({ inscription });
      await sql`DELETE FROM inscriptions WHERE id = ${inscription.id}`;
      logger.info(
        `PgStore rollback reveal #${args.number} (${args.genesis_id}) at block ${args.block_height}`
      );
    });
  }

  private async rollBackLocation(args: {
    genesis_id: string;
    output: string;
    block_height: number;
  }): Promise<void> {
    const location = await this.getLocation({ genesis_id: args.genesis_id, output: args.output });
    if (!location) return;
    await this.sqlWriteTransaction(async sql => {
      await this.brc20.rollBackLocation({ location });
      await this.recalculateCurrentLocationPointerFromLocationRollBack({ location });
      await sql`DELETE FROM locations WHERE id = ${location.id}`;
      logger.info(
        `PgStore rollback transfer (${args.genesis_id}) on output ${args.output} at block ${args.block_height}`
      );
    });
  }

  private async updateInscriptionLocationPointers(
    pointers: DbLocationPointerInsert[]
  ): Promise<void> {
    if (pointers.length === 0) return;

    // Filters pointer args so we enter only one new pointer per inscription.
    const distinctPointers = (
      cond: (a: DbLocationPointerInsert, b: DbLocationPointerInsert) => boolean
    ): DbLocationPointerInsert[] => {
      const out = new Map<string, DbLocationPointerInsert>();
      for (const ptr of pointers) {
        if (ptr.inscription_id === null) continue;
        const current = out.get(ptr.inscription_id);
        out.set(ptr.inscription_id, current ? (cond(current, ptr) ? current : ptr) : ptr);
      }
      return [...out.values()];
    };

    await this.sqlWriteTransaction(async sql => {
      const distinctIds = [
        ...new Set<string>(pointers.map(i => i.inscription_id).filter(v => v !== null)),
      ];
      const genesisPtrs = distinctPointers(
        (a, b) =>
          parseInt(a.block_height) < parseInt(b.block_height) ||
          (parseInt(a.block_height) === parseInt(b.block_height) &&
            parseInt(a.tx_index) < parseInt(b.tx_index))
      );
      if (genesisPtrs.length) {
        const genesis = await sql<{ old_address: string | null; new_address: string | null }[]>`
          WITH old_pointers AS (
            SELECT inscription_id, address
            FROM genesis_locations
            WHERE inscription_id IN ${sql(distinctIds)}
          ),
          new_pointers AS (
            INSERT INTO genesis_locations ${sql(genesisPtrs)}
            ON CONFLICT (inscription_id) DO UPDATE SET
              location_id = EXCLUDED.location_id,
              block_height = EXCLUDED.block_height,
              tx_index = EXCLUDED.tx_index,
              address = EXCLUDED.address
            WHERE
              EXCLUDED.block_height < genesis_locations.block_height OR
              (EXCLUDED.block_height = genesis_locations.block_height AND
                EXCLUDED.tx_index < genesis_locations.tx_index)
            RETURNING inscription_id, address
          )
          SELECT n.address AS new_address, o.address AS old_address
          FROM new_pointers AS n
          LEFT JOIN old_pointers AS o USING (inscription_id)
        `;
        await this.counts.applyLocations(genesis, true);
      }

      const currentPtrs = distinctPointers(
        (a, b) =>
          parseInt(a.block_height) > parseInt(b.block_height) ||
          (parseInt(a.block_height) === parseInt(b.block_height) &&
            parseInt(a.tx_index) > parseInt(b.tx_index))
      );
      if (currentPtrs.length) {
        const current = await sql<{ old_address: string | null; new_address: string | null }[]>`
          WITH old_pointers AS (
            SELECT inscription_id, address
            FROM current_locations
            WHERE inscription_id IN ${sql(distinctIds)}
          ),
          new_pointers AS (
            INSERT INTO current_locations ${sql(currentPtrs)}
            ON CONFLICT (inscription_id) DO UPDATE SET
              location_id = EXCLUDED.location_id,
              block_height = EXCLUDED.block_height,
              tx_index = EXCLUDED.tx_index,
              address = EXCLUDED.address
            WHERE
              EXCLUDED.block_height > current_locations.block_height OR
              (EXCLUDED.block_height = current_locations.block_height AND
                EXCLUDED.tx_index > current_locations.tx_index)
            RETURNING inscription_id, address
          )
          SELECT n.address AS new_address, o.address AS old_address
          FROM new_pointers AS n
          LEFT JOIN old_pointers AS o USING (inscription_id)
        `;
        await this.counts.applyLocations(current, false);
      }
    });
  }

  private async recalculateCurrentLocationPointerFromLocationRollBack(args: {
    location: DbLocation;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Is the location we're rolling back *the* current location?
      const current = await sql<DbLocationPointer[]>`
        SELECT * FROM current_locations WHERE location_id = ${args.location.id}
      `;
      if (current.count > 0) {
        const update = await sql<DbLocationPointer[]>`
          WITH prev AS (
            SELECT id, block_height, tx_index, address
            FROM locations
            WHERE inscription_id = ${args.location.inscription_id} AND id <> ${args.location.id}
            ORDER BY block_height DESC, tx_index DESC
            LIMIT 1
          )
          UPDATE current_locations AS c SET
            location_id = prev.id,
            block_height = prev.block_height,
            tx_index = prev.tx_index,
            address = prev.address
          FROM prev
          WHERE c.inscription_id = ${args.location.inscription_id}
          RETURNING *
        `;
        await this.counts.rollBackCurrentLocation({ curr: current[0], prev: update[0] });
      }
    });
  }

  private async updateInscriptionRecursions(reveals: DbRevealInsert[]): Promise<void> {
    if (reveals.length === 0) return;
    const inserts: {
      inscription_id: PgSqlQuery;
      ref_inscription_id: PgSqlQuery;
      ref_inscription_genesis_id: string;
    }[] = [];
    for (const i of reveals)
      if (i.inscription && i.recursive_refs?.length) {
        const refSet = new Set(i.recursive_refs);
        for (const ref of refSet)
          inserts.push({
            inscription_id: this
              .sql`(SELECT id FROM inscriptions WHERE genesis_id = ${i.inscription.genesis_id} LIMIT 1)`,
            ref_inscription_id: this
              .sql`(SELECT id FROM inscriptions WHERE genesis_id = ${ref} LIMIT 1)`,
            ref_inscription_genesis_id: ref,
          });
      }
    if (inserts.length === 0) return;
    await this.sqlWriteTransaction(async sql => {
      for (const chunk of batchIterate(inserts, 500))
        await sql`
          INSERT INTO inscription_recursions ${sql(chunk)}
          ON CONFLICT ON CONSTRAINT inscription_recursions_unique DO NOTHING
        `;
    });
  }
}

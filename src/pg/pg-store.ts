import { Order, OrderBy } from '../api/types';
import { SatoshiRarity } from '../api/util/ordinal-satoshi';
import { ENV } from '../env';
import { runMigrations } from './migrations';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';
import {
  DbFullyLocatedInscriptionResult,
  DbInscription,
  DbInscriptionContent,
  DbInscriptionInsert,
  DbLocatedInscription,
  DbLocation,
  DbLocationInsert,
  DbPaginatedResult,
  INSCRIPTIONS_COLUMNS,
  LOCATIONS_COLUMNS,
} from './types';

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

  async updateChainTipBlockHeight(args: { blockHeight: number }): Promise<void> {
    await this.sql`UPDATE chain_tip SET block_height = ${args.blockHeight}`;
  }

  async getChainTipBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  async insertInscriptionGenesis(args: {
    inscription: DbInscriptionInsert;
    location: DbLocationInsert;
  }): Promise<DbLocatedInscription> {
    return await this.sqlWriteTransaction(async sql => {
      let dbInscription = await this.sql<DbInscription[]>`
        SELECT ${sql(INSCRIPTIONS_COLUMNS)}
        FROM inscriptions
        WHERE genesis_id = ${args.inscription.genesis_id}
      `;
      if (dbInscription.count === 0) {
        dbInscription = await sql<DbInscription[]>`
          INSERT INTO inscriptions ${sql(args.inscription)}
          ON CONFLICT ON CONSTRAINT inscriptions_genesis_id_unique DO NOTHING
          RETURNING ${this.sql(INSCRIPTIONS_COLUMNS)}
        `;
      }
      let dbLocation = await this.sql<DbLocation[]>`
        SELECT ${sql(LOCATIONS_COLUMNS)}
        FROM locations
        WHERE inscription_id = ${dbInscription[0].id} AND genesis = TRUE
      `;
      if (dbLocation.count === 0) {
        const location = {
          ...args.location,
          timestamp: sql`to_timestamp(${args.location.timestamp})`,
          inscription_id: dbInscription[0].id,
        };
        dbLocation = await sql<DbLocation[]>`
          INSERT INTO locations ${sql(location)}
          ON CONFLICT ON CONSTRAINT locations_inscription_id_block_hash_unique DO NOTHING
          RETURNING ${this.sql(LOCATIONS_COLUMNS)}
        `;
      }
      return { inscription: dbInscription[0], location: dbLocation[0] };
    });
  }

  async updateInscriptionLocation(args: { location: DbLocationInsert }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      const location = {
        ...args.location,
        timestamp: sql`to_timestamp(${args.location.timestamp})`,
      };
      await sql`
        UPDATE locations SET current = FALSE WHERE inscription_id = ${location.inscription_id}
      `;
      await sql`
        INSERT INTO locations ${sql(location)}
        ON CONFLICT ON CONSTRAINT locations_inscription_id_block_hash_unique DO
          UPDATE SET current = TRUE
      `;
    });
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

  async getInscriptionContent(args: {
    inscription_id: string;
  }): Promise<DbInscriptionContent | undefined> {
    const result = await this.sql<DbInscriptionContent[]>`
      SELECT content, content_type, content_length
      FROM inscriptions
      WHERE genesis_id = ${args.inscription_id}
    `;
    if (result.count > 0) {
      return result[0];
    }
  }

  async getInscriptionETag(args: { inscription_id: string }): Promise<string | undefined> {
    const result = await this.sql<{ etag: string }[]>`
      SELECT date_part('epoch', l.timestamp)::text AS etag
      FROM locations AS l
      INNER JOIN inscriptions AS i ON l.inscription_id = i.id
      WHERE i.genesis_id = ${args.inscription_id}
      AND l.current = TRUE
    `;
    if (result.count > 0) {
      return result[0].etag;
    }
  }

  async getInscriptions(args: {
    genesis_id?: string;
    genesis_block_height?: number;
    genesis_block_hash?: string;
    address?: string;
    mime_type?: string[];
    output?: string;
    sat_rarity?: SatoshiRarity;
    order_by?: OrderBy;
    order?: Order;
    limit: number;
    offset: number;
  }): Promise<DbPaginatedResult<DbFullyLocatedInscriptionResult>> {
    // Sanitize ordering args because we'll use `unsafe` to concatenate them into the query.
    let orderBy = 'gen.block_height';
    switch (args.order_by) {
      case OrderBy.ordinal:
        orderBy = 'loc.sat_ordinal';
        break;
      case OrderBy.rarity:
        orderBy =
          "ARRAY_POSITION(ARRAY['common','uncommon','rare','epic','legendary','mythic'], loc.sat_rarity)";
        break;
    }
    const order = args.order === Order.asc ? 'ASC' : 'DESC';

    const results = await this.sql<({ total: number } & DbFullyLocatedInscriptionResult)[]>`
      SELECT
        i.genesis_id, loc.address, gen.block_height AS genesis_block_height, i.number,
        gen.block_hash AS genesis_block_hash, gen.tx_id AS genesis_tx_id, i.fee AS genesis_fee,
        loc.output, loc.offset, i.mime_type, i.content_type, i.content_length, loc.sat_ordinal,
        loc.sat_rarity, loc.timestamp, COUNT(*) OVER() as total
      FROM inscriptions AS i
      INNER JOIN locations AS loc ON loc.inscription_id = i.id
      INNER JOIN locations AS gen ON gen.inscription_id = i.id
      WHERE loc.current = TRUE AND gen.genesis = TRUE
        ${args.genesis_id ? this.sql`AND i.genesis_id = ${args.genesis_id}` : this.sql``}
        ${
          args.genesis_block_height
            ? this.sql`AND gen.block_height = ${args.genesis_block_height}`
            : this.sql``
        }
        ${
          args.genesis_block_hash
            ? this.sql`AND gen.block_hash = ${args.genesis_block_hash}`
            : this.sql``
        }
        ${args.address ? this.sql`AND loc.address = ${args.address}` : this.sql``}
        ${
          args.mime_type?.length
            ? this.sql`AND i.mime_type IN ${this.sql(args.mime_type)}`
            : this.sql``
        }
        ${args.output ? this.sql`AND loc.output = ${args.output}` : this.sql``}
        ${args.sat_rarity ? this.sql`AND loc.sat_rarity = ${args.sat_rarity}` : this.sql``}
      ORDER BY ${this.sql.unsafe(orderBy)} ${this.sql.unsafe(order)}
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }
}

import { Order, OrderBy } from '../api/schemas';
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
  DbLocation,
  DbLocationInsert,
  DbPaginatedResult,
  INSCRIPTIONS_COLUMNS,
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

  async updateChainTipBlockHeight(args: { blockHeight: number }): Promise<void> {
    await this.sql`UPDATE chain_tip SET block_height = ${args.blockHeight}`;
  }

  async getInscriptionTransfersETag(): Promise<string> {
    const result = await this.sql<{ max: number }[]>`SELECT MAX(id) FROM locations`;
    return result[0].max.toString();
  }

  async insertInscriptionGenesis(args: {
    inscription: DbInscriptionInsert;
    location: DbLocationInsert;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
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

  async rollBackInscriptionGenesis(args: { genesis_id: string }): Promise<void> {
    // This will cascade into the `locations` table.
    await this.sql`DELETE FROM inscriptions WHERE genesis_id = ${args.genesis_id}`;
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

  async getInscriptions(args: {
    genesis_id?: string;
    genesis_block_height?: number;
    genesis_block_hash?: string;
    from_genesis_block_height?: number;
    to_genesis_block_height?: number;
    from_genesis_timestamp?: number;
    to_genesis_timestamp?: number;
    from_sat_coinbase_height?: number;
    to_sat_coinbase_height?: number;
    number?: number;
    from_number?: number;
    to_number?: number;
    address?: string;
    mime_type?: string[];
    output?: string;
    sat_rarity?: SatoshiRarity[];
    sat_ordinal?: bigint;
    from_sat_ordinal?: bigint;
    to_sat_ordinal?: bigint;
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
        loc.sat_rarity, loc.timestamp, gen.timestamp AS genesis_timestamp, loc.value,
        gen.address AS genesis_address, loc.sat_coinbase_height,
        COUNT(*) OVER() as total
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
        ${
          args.from_genesis_block_height
            ? this.sql`AND gen.block_height >= ${args.from_genesis_block_height}`
            : this.sql``
        }
        ${
          args.to_genesis_block_height
            ? this.sql`AND gen.block_height <= ${args.to_genesis_block_height}`
            : this.sql``
        }
        ${
          args.from_sat_coinbase_height
            ? this.sql`AND loc.sat_coinbase_height >= ${args.from_sat_coinbase_height}`
            : this.sql``
        }
        ${
          args.to_sat_coinbase_height
            ? this.sql`AND loc.sat_coinbase_height <= ${args.to_sat_coinbase_height}`
            : this.sql``
        }
        ${
          args.from_genesis_timestamp
            ? this.sql`AND gen.timestamp >= to_timestamp(${args.from_genesis_timestamp})`
            : this.sql``
        }
        ${
          args.to_genesis_timestamp
            ? this.sql`AND gen.timestamp <= to_timestamp(${args.to_genesis_timestamp})`
            : this.sql``
        }
        ${
          args.from_sat_ordinal
            ? this.sql`AND loc.sat_ordinal >= ${args.from_sat_ordinal}`
            : this.sql``
        }
        ${
          args.to_sat_ordinal ? this.sql`AND loc.sat_ordinal <= ${args.to_sat_ordinal}` : this.sql``
        }
        ${args.number ? this.sql`AND i.number = ${args.number}` : this.sql``}
        ${args.from_number ? this.sql`AND i.number >= ${args.from_number}` : this.sql``}
        ${args.to_number ? this.sql`AND i.number <= ${args.to_number}` : this.sql``}
        ${args.address ? this.sql`AND loc.address = ${args.address}` : this.sql``}
        ${
          args.mime_type?.length
            ? this.sql`AND i.mime_type IN ${this.sql(args.mime_type)}`
            : this.sql``
        }
        ${args.output ? this.sql`AND loc.output = ${args.output}` : this.sql``}
        ${
          args.sat_rarity?.length
            ? this.sql`AND loc.sat_rarity IN ${this.sql(args.sat_rarity)}`
            : this.sql``
        }
        ${args.sat_ordinal ? this.sql`AND loc.sat_ordinal = ${args.sat_ordinal}` : this.sql``}
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

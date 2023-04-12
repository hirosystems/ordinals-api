import { Order, OrderBy } from '../api/schemas';
import { SatoshiRarity } from '../api/util/ordinal-satoshi';
import { ENV } from '../env';
import { inscriptionContentToJson } from './helpers';
import { runMigrations } from './migrations';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';
import {
  DbFullyLocatedInscriptionResult,
  DbInscriptionContent,
  DbInscriptionInsert,
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

  async updateChainTipBlockHeight(args: { blockHeight: number }): Promise<void> {
    await this.sql`
      UPDATE chain_tip SET block_height = GREATEST(${args.blockHeight}, block_height)
    `;
  }

  async getChainTipBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  async getMaxInscriptionNumber(): Promise<number | undefined> {
    const result = await this.sql<{ max: number }[]>`SELECT MAX(number) FROM inscriptions`;
    if (result[0].max) {
      return result[0].max;
    }
  }

  async getInscriptionTransfersETag(): Promise<string> {
    const result = await this.sql<{ max: number }[]>`SELECT MAX(id) FROM locations`;
    return result[0].max.toString();
  }

  async insertInscriptionGenesis(args: {
    inscription: DbInscriptionInsert;
    location: DbLocationInsert;
  }): Promise<void> {
    let inscription_id: number | undefined;
    await this.sqlWriteTransaction(async sql => {
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
      const json = inscriptionContentToJson(args.inscription);
      if (json) {
        const values = {
          inscription_id,
          p: json.p,
          op: json.op,
          content: json,
        };
        await sql`
          INSERT INTO json_contents ${sql(values)}
          ON CONFLICT ON CONSTRAINT json_contents_inscription_id_unique DO UPDATE SET
            p = EXCLUDED.p,
            op = EXCLUDED.op,
            content = EXCLUDED.content
        `;
      }
      await this.updateChainTipBlockHeight({ blockHeight: args.location.block_height });
    });
    if (inscription_id) await this.normalizeInscriptionLocations({ inscription_id });
  }

  async insertInscriptionTransfer(args: { location: DbLocationInsert }): Promise<void> {
    let inscription_id: number | undefined;
    await this.sqlWriteTransaction(async sql => {
      const inscription = await sql<{ id: number }[]>`
        SELECT id FROM inscriptions WHERE genesis_id = ${args.location.genesis_id}
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
    if (inscription_id) await this.normalizeInscriptionLocations({ inscription_id });
  }

  async rollBackInscriptionGenesis(args: { genesis_id: string }): Promise<void> {
    // This will cascade into dependent tables.
    await this.sql`DELETE FROM inscriptions WHERE genesis_id = ${args.genesis_id}`;
  }

  async rollBackInscriptionTransfer(args: { genesis_id: string; output: string }): Promise<void> {
    let inscription_id: number | undefined;
    await this.sqlWriteTransaction(async sql => {
      const inscription = await sql<{ id: number }[]>`
        SELECT id FROM inscriptions WHERE genesis_id = ${args.genesis_id}
      `;
      inscription_id = inscription[0].id;
      await sql`
        DELETE FROM locations
        WHERE inscription_id = ${inscription_id} AND output = ${args.output}
      `;
    });
    if (inscription_id) await this.normalizeInscriptionLocations({ inscription_id });
  }

  private async normalizeInscriptionLocations(args: { inscription_id: number }): Promise<void> {
    await this.sql`
      WITH i_genesis AS (
        SELECT id FROM locations
        WHERE inscription_id = ${args.inscription_id}
        ORDER BY block_height ASC
        LIMIT 1
      ), i_current AS (
        SELECT id FROM locations
        WHERE inscription_id = ${args.inscription_id}
        ORDER BY block_height DESC
        LIMIT 1
      )
      UPDATE locations SET
        current = (CASE WHEN id = (SELECT id FROM i_current) THEN TRUE ELSE FALSE END),
        genesis = (CASE WHEN id = (SELECT id FROM i_genesis) THEN TRUE ELSE FALSE END)
      WHERE inscription_id = ${args.inscription_id}
    `;
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
    genesis_id?: string[];
    genesis_block_height?: number;
    genesis_block_hash?: string;
    from_genesis_block_height?: number;
    to_genesis_block_height?: number;
    from_genesis_timestamp?: number;
    to_genesis_timestamp?: number;
    from_sat_coinbase_height?: number;
    to_sat_coinbase_height?: number;
    number?: number[];
    from_number?: number;
    to_number?: number;
    address?: string[];
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
        COUNT(*) OVER() as total
      FROM inscriptions AS i
      INNER JOIN locations AS loc ON loc.inscription_id = i.id
      INNER JOIN locations AS gen ON gen.inscription_id = i.id
      WHERE loc.current = TRUE AND gen.genesis = TRUE
        ${
          args.genesis_id?.length
            ? this.sql`AND i.genesis_id IN ${this.sql(args.genesis_id)}`
            : this.sql``
        }
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
        ${args.number?.length ? this.sql`AND i.number IN ${this.sql(args.number)}` : this.sql``}
        ${args.from_number ? this.sql`AND i.number >= ${args.from_number}` : this.sql``}
        ${args.to_number ? this.sql`AND i.number <= ${args.to_number}` : this.sql``}
        ${
          args.address?.length ? this.sql`AND loc.address IN ${this.sql(args.address)}` : this.sql``
        }
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
}

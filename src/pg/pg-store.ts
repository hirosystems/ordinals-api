import { ENV } from '../env';
import { runMigrations } from './migrations';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';
import {
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
      const prevNumber = await sql<{ max: number }[]>`
        SELECT MAX(number) as max FROM inscriptions
      `;
      const inscription = {
        ...args.inscription,
        number: prevNumber[0].max !== null ? prevNumber[0].max + 1 : 0,
      };
      const dbInscription = await sql<DbInscription[]>`
        INSERT INTO inscriptions ${sql(inscription)}
        ON CONFLICT ON CONSTRAINT inscriptions_genesis_id_unique DO NOTHING
        RETURNING ${this.sql(INSCRIPTIONS_COLUMNS)}
      `;
      const location = {
        ...args.location,
        timestamp: sql`to_timestamp(${args.location.timestamp})`,
        inscription_id: dbInscription[0].id,
      };
      const dbLocation = await sql<DbLocation[]>`
        INSERT INTO locations ${sql(location)}
        ON CONFLICT ON CONSTRAINT locations_inscription_id_block_hash_unique DO NOTHING
        RETURNING ${this.sql(LOCATIONS_COLUMNS)}
      `;
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

  async getInscription(
    args: { inscription_id: string } | { ordinal: number }
  ): Promise<DbInscription | undefined> {
    const result = await this.sql<DbInscription[]>`
      SELECT ${this.sql(INSCRIPTIONS_COLUMNS)}
      FROM inscriptions
      WHERE ${
        'ordinal' in args
          ? this.sql`sat_ordinal = ${args.ordinal}`
          : this.sql`inscription_id = ${args.inscription_id}`
      }
      ORDER BY block_height DESC
      LIMIT 1
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0];
  }

  async getInscriptionLocation(args: { output: string }): Promise<DbLocation | undefined> {
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
      WHERE inscription_id = ${args.inscription_id}
      ORDER BY block_height DESC
      LIMIT 1
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0];
  }

  async getInscriptions(args: {
    block_height?: number;
    block_hash?: string;
    address?: string;
    mime_type?: string[];
    sat_rarity?: string;
    limit: number;
    offset: number;
  }): Promise<DbPaginatedResult<DbInscription>> {
    const results = await this.sql<({ total: number } & DbInscription)[]>`
      SELECT ${this.sql(INSCRIPTIONS_COLUMNS)}, COUNT(*) OVER() as total
      FROM inscriptions
      WHERE true
        ${args.block_height ? this.sql`AND block_height = ${args.block_height}` : this.sql``}
        ${args.block_hash ? this.sql`AND block_hash = ${args.block_hash}` : this.sql``}
        ${args.address ? this.sql`AND address = ${args.address}` : this.sql``}
        ${args.sat_rarity ? this.sql`AND sat_rarity = ${args.sat_rarity}` : this.sql``}
        ${
          args.mime_type?.length
            ? this.sql`AND mime_type IN ${this.sql(args.mime_type)}`
            : this.sql``
        }
      ORDER BY block_height DESC
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `;
    return {
      total: results[0]?.total ?? 0,
      results: results ?? [],
    };
  }
}

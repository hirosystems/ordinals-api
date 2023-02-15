import { ENV } from '../env';
import { runMigrations } from './migrations';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';
import {
  DbInscription,
  DbInscriptionContent,
  DbPaginatedResult,
  INSCRIPTIONS_COLUMNS,
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

  async getInscription(args: { inscription_id: string }): Promise<DbInscription | undefined> {
    const result = await this.sql<DbInscription[]>`
      SELECT ${this.sql(INSCRIPTIONS_COLUMNS)}
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
    address?: string;
    limit: number;
    offset: number;
  }): Promise<DbPaginatedResult<DbInscription>> {
    const results = await this.sql<({ total: number } & DbInscription)[]>`
      SELECT ${this.sql(INSCRIPTIONS_COLUMNS)}, COUNT(*) OVER() as total
      FROM inscriptions
      WHERE true
        ${args.block_height ? this.sql`AND block_height = ${args.block_height}` : this.sql``}
        ${args.address ? this.sql`AND address = ${args.address}` : this.sql``}
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

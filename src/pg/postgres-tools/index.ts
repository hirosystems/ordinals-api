import * as postgres from 'postgres';
import { logger } from '../../logger';
import { isPgConnectionError } from './errors';
import { stopwatch, timeout } from './helpers';
import { PG_TYPE_MAPPINGS } from './types';

export type PgSqlClient = postgres.Sql<any> | postgres.TransactionSql<any>;

export type PgConnectionUri = string;
export type PgConnectionVars = {
  database: string;
  user: string;
  password: string;
  host: string;
  port: number;
  schema?: string;
  ssl?: boolean;
  applicationName?: string;
};
export type PgConnectionArgs = PgConnectionUri | PgConnectionVars;

export type PgConnectionConfig = {
  idleTimeout?: number;
  maxLifetime?: number;
  poolMax?: number;
};

/**
 * Connects to Postgres. This function will also test the connection first to make sure
 * all connection parameters are specified correctly in `.env`.
 * @param args - Connection options
 * @returns configured `Pool` object
 */
export async function connectPostgres({
  usageName,
  connectionArgs,
  connectionConfig,
}: {
  usageName: string;
  connectionArgs: PgConnectionArgs;
  connectionConfig?: PgConnectionConfig;
}): Promise<PgSqlClient> {
  const initTimer = stopwatch();
  let connectionError: Error | undefined;
  let connectionOkay = false;
  let lastElapsedLog = 0;
  do {
    const testSql = getPostgres({
      usageName: `${usageName};conn-poll`,
      connectionArgs,
      connectionConfig,
    });
    try {
      await testSql`SELECT version()`;
      connectionOkay = true;
      break;
    } catch (error: any) {
      if (isPgConnectionError(error)) {
        const timeElapsed = initTimer.getElapsed();
        if (timeElapsed - lastElapsedLog > 2000) {
          lastElapsedLog = timeElapsed;
          logger.error(error, 'Pg connection failed, retrying..');
        }
        connectionError = error;
        await timeout(100);
      } else {
        logger.error(error, 'Cannot connect to pg');
        throw error;
      }
    } finally {
      await testSql.end();
    }
  } while (initTimer.getElapsed() < Number.MAX_SAFE_INTEGER);
  if (!connectionOkay) {
    connectionError = connectionError ?? new Error('Error connecting to database');
    throw connectionError;
  }
  const sql = getPostgres({
    usageName: `${usageName};datastore-crud`,
    connectionArgs,
    connectionConfig,
  });
  return sql;
}

export function getPostgres({
  usageName,
  connectionArgs,
  connectionConfig,
}: {
  usageName: string;
  connectionArgs: PgConnectionArgs;
  connectionConfig?: PgConnectionConfig;
}): PgSqlClient {
  const defaultAppName = 'postgres';
  let sql: PgSqlClient;
  if (typeof connectionArgs === 'string') {
    const uri = new URL(connectionArgs);
    const searchParams = Object.fromEntries(
      [...uri.searchParams.entries()].map(([k, v]) => [k.toLowerCase(), v])
    );
    // Not really standardized
    const schema: string | undefined =
      searchParams['currentschema'] ??
      searchParams['current_schema'] ??
      searchParams['searchpath'] ??
      searchParams['search_path'] ??
      searchParams['schema'];
    const appName = `${uri.searchParams.get('application_name') ?? defaultAppName}:${usageName}`;
    uri.searchParams.set('application_name', appName);
    sql = postgres(uri.toString(), {
      types: PG_TYPE_MAPPINGS,
      max: connectionConfig?.poolMax ?? 10,
      connection: {
        application_name: appName,
        search_path: schema,
      },
    });
  } else {
    const appName = `${connectionArgs.applicationName ?? defaultAppName}:${usageName}`;
    sql = postgres({
      database: connectionArgs.database,
      user: connectionArgs.user,
      password: connectionArgs.password,
      host: connectionArgs.host,
      port: connectionArgs.port,
      ssl: connectionArgs.ssl,
      idle_timeout: connectionConfig?.idleTimeout,
      max_lifetime: connectionConfig?.maxLifetime,
      max: connectionConfig?.poolMax,
      types: PG_TYPE_MAPPINGS,
      connection: {
        application_name: appName,
        search_path: connectionArgs.schema,
      },
    });
  }
  return sql;
}

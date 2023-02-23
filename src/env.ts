import { Static, Type } from '@sinclair/typebox';
import envSchema from 'env-schema';

export const isDevEnv = process.env.NODE_ENV === 'development';
export const isTestEnv = process.env.NODE_ENV === 'test';
export const isProdEnv =
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'prod' ||
  !process.env.NODE_ENV ||
  (!isTestEnv && !isDevEnv);

const schema = Type.Object({
  /** Hostname of the API server */
  API_HOST: Type.String(),
  /** Port in which to serve the API */
  API_PORT: Type.Number({ default: 3000, minimum: 0, maximum: 65535 }),
  PGHOST: Type.String(),
  PGPORT: Type.Number({ default: 5432, minimum: 0, maximum: 65535 }),
  PGUSER: Type.String(),
  PGPASSWORD: Type.String(),
  PGDATABASE: Type.String(),
  /**
   * Limit to how many concurrent connections can be created, defaults to 10.
   */
  PG_CONNECTION_POOL_MAX: Type.Number({ default: 10 }),
  PG_IDLE_TIMEOUT: Type.Number({ default: 30 }),
  PG_MAX_LIFETIME: Type.Number({ default: 60 }),
  BITCOIN_RPC_HOST: Type.String(),
  BITCOIN_RPC_PORT: Type.Number(),
});
type Env = Static<typeof schema>;

export const ENV = envSchema<Env>({
  schema: schema,
  dotenv: true,
});

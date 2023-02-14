import envSchema from 'env-schema';

export const isDevEnv = process.env.NODE_ENV === 'development';
export const isTestEnv = process.env.NODE_ENV === 'test';
export const isProdEnv =
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'prod' ||
  !process.env.NODE_ENV ||
  (!isTestEnv && !isDevEnv);

interface Env {
  /** Hosname of the API server */
  API_HOST: string;
  /** Port in which to serve the API */
  API_PORT: number;

  PGHOST: string;
  PGPORT: number;
  PGUSER: string;
  PGPASSWORD: string;
  PGDATABASE: string;
  /**
   * Limit to how many concurrent connections can be created, defaults to 10.
   */
  PG_CONNECTION_POOL_MAX: number;
  /** Idle connection timeout (seconds). */
  PG_IDLE_TIMEOUT: number;
  /** Max lifetime of a connection (seconds). */
  PG_MAX_LIFETIME: number;
}

export function getEnvVars(): Env {
  const schema = {
    type: 'object',
    required: ['API_HOST', 'API_PORT', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'],
    properties: {
      API_HOST: {
        type: 'string',
      },
      API_PORT: {
        type: 'number',
        default: 3000,
        minimum: 0,
        maximum: 65535,
      },
      PGHOST: {
        type: 'string',
      },
      PGPORT: {
        type: 'number',
        default: 5432,
        minimum: 0,
        maximum: 65535,
      },
      PGUSER: {
        type: 'string',
      },
      PGPASSWORD: {
        type: 'string',
      },
      PGDATABASE: {
        type: 'string',
      },
      PG_CONNECTION_POOL_MAX: {
        type: 'number',
        default: 10,
      },
      PG_IDLE_TIMEOUT: {
        type: 'number',
        default: 30,
      },
      PG_MAX_LIFETIME: {
        type: 'number',
        default: 60,
      },
    },
  };
  const config = envSchema<Env>({
    schema: schema,
    dotenv: true,
  });
  return config;
}

export const ENV = getEnvVars();

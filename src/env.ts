import envSchema from 'env-schema';

export const isDevEnv = process.env.NODE_ENV === 'development';
export const isTestEnv = process.env.NODE_ENV === 'test';
export const isProdEnv =
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'prod' ||
  !process.env.NODE_ENV ||
  (!isTestEnv && !isDevEnv);

interface Env {
  STACKS_API_ENDPOINT: string;
  STACKS_EXPLORER_ENDPOINT: string;
  MEMPOOL_JS_HOSTNAME: string;
  BLOCKCHAIN_INFO_API_ENDPOINT: string;
  BLOCKCHAIN_EXPLORER_ENDPOINT: string;
}

export function getEnvVars(): Env {
  const schema = {
    type: 'object',
    required: [
      'STACKS_API_ENDPOINT',
      'STACKS_EXPLORER_ENDPOINT',
      'MEMPOOL_JS_HOSTNAME',
      'BLOCKCHAIN_INFO_API_ENDPOINT',
      'BLOCKCHAIN_EXPLORER_ENDPOINT',
    ],
    properties: {
      STACKS_API_ENDPOINT: {
        type: 'string',
        default: 'https://stacks-node-api.mainnet.stacks.co',
      },
      STACKS_EXPLORER_ENDPOINT: {
        type: 'string',
        default: 'https://explorer.stacks.co',
      },
      MEMPOOL_JS_HOSTNAME: {
        type: 'string',
        default: 'mempool.space',
      },
      BLOCKCHAIN_INFO_API_ENDPOINT: {
        type: 'string',
        default: 'https://blockchain.info',
      },
      BLOCKCHAIN_EXPLORER_ENDPOINT: {
        type: 'string',
        default: 'https://www.blockchain.com',
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

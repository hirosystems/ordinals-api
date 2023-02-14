import Fastify, { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Api } from '../src/api/init';
import FastifySwagger, { SwaggerOptions } from '@fastify/swagger';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { Server } from 'http';

export const ApiSwaggerOptions: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Stacks + Bitcoin Utility Service',
      description:
        '#### Simple, developer-friendly APIs for various uses. \n _No Stacks CLI installed?_ No problem. _Not sure how to encode a value for a read-only contract call?_ No problem. Use the simple cURL commands in the examples below. \n * Retrieve Bitcoin information related to Stacks and vice versa. \n * Easily invoke Clarity function calls or data lookups with endpoints that automatically encoding & decoding Clarity values. \n * Chain-tip based HTTP caching support for expensive Stacks RPC endpoints.',
      version: '0.0.1',
    },
    externalDocs: {
      url: 'https://github.com/hirosystems/stx-btc-api',
      description: 'Source Repository',
    },
    tags: [
      {
        name: 'Utils',
        description: 'Converter / helpers',
      },
      {
        name: 'Bitcoin info',
        description: 'Get Bitcoin information related to Stacks information and vice versa',
      },
    ],
  },
  exposeRoute: true,
};

/**
 * Generates `openapi.yaml` based on current Swagger definitions.
 */
export const ApiGenerator: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(FastifySwagger, ApiSwaggerOptions);
  await fastify.register(Api);
  if (!existsSync('./tmp')) {
    mkdirSync('./tmp');
  }
  writeFileSync('./tmp/openapi.yaml', fastify.swagger({ yaml: true }) as unknown as string);
};

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

void fastify.register(ApiGenerator).then(async () => {
  await fastify.close();
});

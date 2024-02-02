import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  BitcoinEvent,
  BitcoinInscriptionRevealed,
  BitcoinInscriptionTransferred,
  BitcoinTransaction,
  Payload,
} from '@hirosystems/chainhook-client';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { Brc20 } from '../src/pg/brc20/helpers';

export type TestFastifyServer = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

export class TestChainhookPayloadBuilder {
  private payload: Payload = {
    apply: [],
    rollback: [],
    chainhook: {
      uuid: 'test',
      predicate: {
        scope: 'ordinals_protocol',
        operation: 'inscription_feed',
      },
      is_streaming_blocks: true,
    },
  };
  private action: 'apply' | 'rollback' = 'apply';
  private get lastBlock(): BitcoinEvent {
    return this.payload[this.action][this.payload[this.action].length - 1] as BitcoinEvent;
  }
  private get lastBlockTx(): BitcoinTransaction {
    return this.lastBlock.transactions[this.lastBlock.transactions.length - 1];
  }

  streamingBlocks(streaming: boolean): this {
    this.payload.chainhook.is_streaming_blocks = streaming;
    return this;
  }

  apply(): this {
    this.action = 'apply';
    return this;
  }

  rollback(): this {
    this.action = 'rollback';
    return this;
  }

  block(args: { height: number; hash?: string; timestamp?: number }): this {
    this.payload[this.action].push({
      block_identifier: {
        index: args.height,
        hash: args.hash ?? '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
      },
      parent_block_identifier: {
        index: args.height - 1,
        hash: '0x117374e7078440835a744b6b1b13dd2c48c4eff8c58dde07162241a8f15d1e03',
      },
      timestamp: args.timestamp ?? 1677803510,
      transactions: [],
      metadata: {},
    } as BitcoinEvent);
    return this;
  }

  transaction(args: { hash: string }): this {
    this.lastBlock.transactions.push({
      transaction_identifier: {
        hash: args.hash,
      },
      operations: [],
      metadata: {
        ordinal_operations: [],
        proof: null,
      },
    });
    return this;
  }

  inscriptionRevealed(args: BitcoinInscriptionRevealed): this {
    this.lastBlockTx.metadata.ordinal_operations.push({ inscription_revealed: args });
    return this;
  }

  inscriptionTransferred(args: BitcoinInscriptionTransferred): this {
    this.lastBlockTx.metadata.ordinal_operations.push({ inscription_transferred: args });
    return this;
  }

  build(): Payload {
    return this.payload;
  }
}

export function rollBack(payload: Payload) {
  return {
    ...payload,
    apply: [],
    rollback: payload.apply,
  };
}

export function brc20Reveal(args: {
  json: Brc20;
  number: number;
  classic_number?: number;
  address: string;
  tx_id: string;
  ordinal_number: number;
}): BitcoinInscriptionRevealed {
  const content = Buffer.from(JSON.stringify(args.json), 'utf-8');
  const reveal: BitcoinInscriptionRevealed = {
    content_bytes: `0x${content.toString('hex')}`,
    content_type: 'text/plain;charset=utf-8',
    content_length: content.length,
    inscription_number: {
      jubilee: args.number,
      classic: args.classic_number ?? args.number,
    },
    inscription_fee: 2000,
    inscription_id: `${args.tx_id}i0`,
    inscription_output_value: 10000,
    inscriber_address: args.address,
    ordinal_number: args.ordinal_number,
    ordinal_block_height: 0,
    ordinal_offset: 0,
    satpoint_post_inscription: `${args.tx_id}:0:0`,
    inscription_input_index: 0,
    transfers_pre_inscription: 0,
    tx_index: 0,
    curse_type: null,
  };
  return reveal;
}

/** Generate a random hash like string for testing */
export const randomHash = () =>
  [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

/** Generator for incrementing numbers */
export function* incrementing(
  start: number = 0,
  step: number = 1
): Generator<number, number, 'next'> {
  let current = start;

  while (true) {
    yield current;
    current += step;
  }
}

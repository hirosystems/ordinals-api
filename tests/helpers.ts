import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  BitcoinCursedInscriptionRevealed,
  BitcoinEvent,
  BitcoinInscriptionRevealed,
  BitcoinInscriptionTransferred,
  BitcoinTransaction,
  Payload,
} from '@hirosystems/chainhook-client';

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

  cursedInscriptionRevealed(args: BitcoinCursedInscriptionRevealed): this {
    this.lastBlockTx.metadata.ordinal_operations.push({ cursed_inscription_revealed: args });
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

/** Generate a random hash like string for testing */
export const randomHash = () =>
  [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

/** Generate a random-ish reveal apply payload for testing */
export function testRevealApply(
  blockHeight: number,
  args: { blockHash?: string; timestamp?: number } = {}
) {
  // todo: more params could be randomized
  const randomHex = randomHash();
  return new TestChainhookPayloadBuilder()
    .apply()
    .block({
      height: blockHeight,
      hash: args.blockHash ?? '0x00000000000000000002a90330a99f67e3f01eb2ce070b45930581e82fb7a91d',
      timestamp: args.timestamp ?? 1676913207,
    })
    .transaction({
      hash: `0x${randomHex}`,
    })
    .inscriptionRevealed({
      content_bytes: '0x48656C6C6F',
      content_type: 'image/png',
      content_length: 5,
      inscription_number: Math.floor(Math.random() * 100_000),
      inscription_fee: 2805,
      inscription_id: `${randomHex}i0`,
      inscription_output_value: 10000,
      inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
      satpoint_post_inscription: `${randomHex}:0:0`,
      ordinal_number: Math.floor(Math.random() * 1_000_000),
      ordinal_block_height: Math.floor(Math.random() * 777_000),
      ordinal_offset: 0,
      inscription_input_index: 0,
      transfers_pre_inscription: 0,
      tx_index: 0,
    })
    .build();
}

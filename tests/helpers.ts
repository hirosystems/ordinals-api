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
    },
  };
  private action: 'apply' | 'rollback' = 'apply';
  private get lastBlock(): BitcoinEvent {
    return this.payload[this.action][this.payload[this.action].length - 1];
  }
  private get lastBlockTx(): BitcoinTransaction {
    return this.lastBlock.transactions[this.lastBlock.transactions.length - 1];
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

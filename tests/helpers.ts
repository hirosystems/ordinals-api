import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ChainhookPayload,
  CursedInscriptionRevealed,
  InscriptionEvent,
  InscriptionRevealed,
  InscriptionTransferred,
  Transaction,
} from '../src/chainhook/schemas';
import { Brc20 } from '../src/pg/helpers';

export type TestFastifyServer = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

export class TestChainhookPayloadBuilder {
  private payload: ChainhookPayload = {
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
  private get lastBlock(): InscriptionEvent {
    return this.payload[this.action][this.payload[this.action].length - 1];
  }
  private get lastBlockTx(): Transaction {
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
    });
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

  inscriptionRevealed(args: InscriptionRevealed): this {
    this.lastBlockTx.metadata.ordinal_operations.push({ inscription_revealed: args });
    return this;
  }

  cursedInscriptionRevealed(args: CursedInscriptionRevealed): this {
    this.lastBlockTx.metadata.ordinal_operations.push({ cursed_inscription_revealed: args });
    return this;
  }

  inscriptionTransferred(args: InscriptionTransferred): this {
    this.lastBlockTx.metadata.ordinal_operations.push({ inscription_transferred: args });
    return this;
  }

  build(): ChainhookPayload {
    return this.payload;
  }
}

export function brc20Reveal(args: {
  json: Brc20;
  number: number;
  address: string;
  tx_id: string;
}): InscriptionRevealed {
  const content = Buffer.from(JSON.stringify(args.json), 'utf-8');
  return {
    content_bytes: `0x${content.toString('hex')}`,
    content_type: 'text/plain;charset=utf-8',
    content_length: content.length,
    inscription_number: args.number,
    inscription_fee: 2000,
    inscription_id: `${args.tx_id}i0`,
    inscription_output_value: 10000,
    inscriber_address: args.address,
    ordinal_number: 0,
    ordinal_block_height: 0,
    ordinal_offset: 0,
    satpoint_post_inscription: `${args.tx_id}:0:0`,
  };
}

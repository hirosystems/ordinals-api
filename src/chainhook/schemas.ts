import { Static, TSchema, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const Nullable = <T extends TSchema>(type: T) => Type.Union([type, Type.Null()]);

const Block = Type.Object({
  index: Type.Integer(),
  hash: Type.String(),
});

const InscriptionRevealed = Type.Object({
  content_bytes: Type.String(),
  content_type: Type.String(),
  content_length: Type.Integer(),
  inscription_number: Type.Integer(),
  inscription_fee: Type.Integer(),
  inscription_id: Type.String(),
  inscriber_address: Type.String(),
  ordinal_number: Type.Integer(),
  ordinal_block_height: Type.Integer(),
  ordinal_offset: Type.Integer(),
  satpoint_post_inscription: Type.String(),
});

const InscriptionTransferred = Type.Object({
  inscription_number: Type.Integer(),
  inscription_id: Type.String(),
  ordinal_number: Type.Integer(),
  updated_address: Type.String(),
  satpoint_pre_transfer: Type.String(),
  satpoint_post_transfer: Type.String(),
});

const OrdinalOperation = Type.Object({
  inscription_revealed: Type.Optional(InscriptionRevealed),
  inscription_transferred: Type.Optional(InscriptionTransferred),
});

const Output = Type.Object({
  script_pubkey: Type.String(),
  value: Type.Integer(),
});

const Transaction = Type.Object({
  transaction_identifier: Type.Object({ hash: Type.String() }),
  operations: Type.Array(Type.Any()),
  metadata: Type.Object({
    ordinal_operations: Type.Array(OrdinalOperation),
    outputs: Type.Array(Output),
    proof: Nullable(Type.String()),
  }),
});

const Event = Type.Object({
  block_identifier: Block,
  parent_block_identifier: Block,
  timestamp: Type.Integer(),
  transactions: Type.Array(Transaction),
  metadata: Type.Any(),
});

const ChainhookPayload = Type.Object({
  apply: Type.Array(Event),
  rollback: Type.Array(Event),
  chainhook: Type.Object({
    uuid: Type.String(),
    predicate: Type.Object({
      scope: Type.String(),
      ordinal: Type.String(),
    }),
  }),
});
export type ChainhookPayload = Static<typeof ChainhookPayload>;
export const ChainhookPayloadCType = TypeCompiler.Compile(ChainhookPayload);

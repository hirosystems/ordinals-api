import { Static, TSchema, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const Nullable = <T extends TSchema>(type: T) => Type.Union([type, Type.Null()]);

const Block = Type.Object({
  index: Type.Integer(),
  hash: Type.String(),
});

const InscriptionRevealedSchema = Type.Object({
  content_bytes: Type.String(),
  content_type: Type.String(),
  content_length: Type.Integer(),
  inscription_number: Type.Integer(),
  inscription_fee: Type.Integer(),
  inscription_id: Type.String(),
  inscription_output_value: Type.Integer(),
  inscriber_address: Nullable(Type.String()),
  ordinal_number: Type.Integer(),
  ordinal_block_height: Type.Integer(),
  ordinal_offset: Type.Integer(),
  satpoint_post_inscription: Type.String(),
});
export type InscriptionRevealed = Static<typeof InscriptionRevealedSchema>;

const CursedInscriptionRevealedSchema = Type.Object({
  content_bytes: Type.String(),
  content_type: Type.String(),
  content_length: Type.Integer(),
  inscription_number: Type.Integer(),
  inscription_fee: Type.Integer(),
  inscription_id: Type.String(),
  inscription_output_value: Type.Integer(),
  inscriber_address: Nullable(Type.String()),
  ordinal_number: Type.Integer(),
  ordinal_block_height: Type.Integer(),
  ordinal_offset: Type.Integer(),
  satpoint_post_inscription: Type.String(),
  curse_type: Nullable(Type.Any()),
});
export type CursedInscriptionRevealed = Static<typeof CursedInscriptionRevealedSchema>;

const InscriptionTransferredSchema = Type.Object({
  inscription_id: Type.String(),
  updated_address: Nullable(Type.String()),
  satpoint_pre_transfer: Type.String(),
  satpoint_post_transfer: Type.String(),
  post_transfer_output_value: Nullable(Type.Integer()),
});
export type InscriptionTransferred = Static<typeof InscriptionTransferredSchema>;

const OrdinalOperation = Type.Object({
  cursed_inscription_revealed: Type.Optional(CursedInscriptionRevealedSchema),
  inscription_revealed: Type.Optional(InscriptionRevealedSchema),
  inscription_transferred: Type.Optional(InscriptionTransferredSchema),
});

const Output = Type.Object({
  script_pubkey: Type.String(),
  value: Type.Integer(),
});

const TransactionSchema = Type.Object({
  transaction_identifier: Type.Object({ hash: Type.String() }),
  operations: Type.Array(Type.Any()),
  metadata: Type.Object({
    ordinal_operations: Type.Array(OrdinalOperation),
    outputs: Type.Optional(Type.Array(Output)),
    proof: Nullable(Type.String()),
  }),
});
export type Transaction = Static<typeof TransactionSchema>;

const Event = Type.Object({
  block_identifier: Block,
  parent_block_identifier: Block,
  timestamp: Type.Integer(),
  transactions: Type.Array(TransactionSchema),
  metadata: Type.Any(),
});
export type InscriptionEvent = Static<typeof Event>;

const ChainhookPayload = Type.Object({
  apply: Type.Array(Event),
  rollback: Type.Array(Event),
  chainhook: Type.Object({
    uuid: Type.String(),
    predicate: Type.Object({
      scope: Type.String(),
      operation: Type.String(),
    }),
    is_streaming_blocks: Type.Boolean(),
  }),
});
export type ChainhookPayload = Static<typeof ChainhookPayload>;
export const ChainhookPayloadCType = TypeCompiler.Compile(ChainhookPayload);

import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const Block = Type.Object({
  index: Type.Integer(),
  hash: Type.String(),
});

const InscriptionRevealed = Type.Object({
  inscription: Type.Object({
    content_bytes: Type.String(),
    content_length: Type.Integer(),
    content_type: Type.String(),
    inscription_id: Type.String(),
    inscription_number: Type.Integer(),
    address: Type.String(),
  }),
  ordinal: Type.Object({
    ordinal_number: Type.Integer(),
    ordinal_block_height: Type.Integer(),
    ordinal_offset: Type.Integer(),
  }),
});

const OrdinalOperation = Type.Object({
  inscription_revealed: InscriptionRevealed,
});

const Output = Type.Object({
  script_pubkey: Type.String(),
  output: Type.String(),
  value: Type.Integer(),
});

const Transaction = Type.Object({
  transaction_identifier: Type.Object({ hash: Type.String() }),
  operations: Type.Array(Type.Any()),
  fee: Type.Integer(),
  metadata: Type.Object({
    ordinal_operations: Type.Array(OrdinalOperation),
    outputs: Type.Array(Output),
    proof: Type.String(),
  }),
});

const Event = Type.Object({
  block_identifier: Block,
  parent_block_identifier: Block,
  timestamp: Type.Integer(),
  transactions: Type.Array(Transaction),
  metadata: Type.Array(Type.Any()),
});

const ChainhookPayload = Type.Object({
  apply: Type.Array(Event),
  rollback: Type.Array(Event),
  chainhook: Type.Object({
    uuid: Type.String(),
    predicate: Type.Object({
      protocol: Type.Object({
        ordinal: Type.String(),
      }),
    }),
  }),
});
export type ChainhookPayload = Static<typeof ChainhookPayload>;
export const ChainhookPayloadCType = TypeCompiler.Compile(ChainhookPayload);

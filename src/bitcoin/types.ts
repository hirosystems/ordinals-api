import { Static, TSchema, Type } from '@sinclair/typebox';

const Nullable = <T extends TSchema>(type: T) => Type.Union([type, Type.Null()]);

const Block = Type.Object(
  {
    hash: Type.String(),
    height: Type.Integer(),
    time: Type.Integer(),
    nTx: Type.Integer(),
    previousblockhash: Type.String(),
    nextblockhash: Nullable(Type.String()),
    tx: Type.Array(Type.String()),
  },
  { additionalProperties: true }
);
export type Block = Static<typeof Block>;

const TransactionVin = Type.Object({
  txid: Type.String(),
  vout: Type.Integer(),
  scriptSig: Type.Object({
    asm: Type.String(),
    hex: Type.String(),
  }),
  txinwitness: Type.Optional(Type.Array(Type.String())),
  sequence: Type.Integer(),
});
export type TransactionVin = Static<typeof TransactionVin>;

const TransactionVout = Type.Object({
  value: Type.Number(),
  n: Type.Integer(),
  scriptPubKey: Type.Object({
    asm: Type.String(),
    desc: Type.String(),
    hex: Type.String(),
    address: Type.String(),
    type: Type.String(),
  }),
});
export type TransactionVout = Static<typeof TransactionVout>;

const Transaction = Type.Object(
  {
    txid: Type.String(),
    hash: Type.String(),
    vin: Type.Array(TransactionVin),
    vout: Type.Array(TransactionVout),
  },
  { additionalProperties: true }
);
export type Transaction = Static<typeof Transaction>;

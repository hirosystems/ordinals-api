import { Type } from '@sinclair/typebox';

export const InscriptionIdRegEx = /[a-fA-F0-9]{64}i[0-9]+/;

export const NotFoundResponse = Type.Object({
  error: Type.Literal('Not found'),
});

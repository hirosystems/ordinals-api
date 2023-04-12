import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { hexToBuffer } from '../api/util/helpers';
import { DbInscriptionInsert } from './types';

const OpJson = Type.Object(
  {
    p: Type.String(),
    op: Type.String(),
  },
  { additionalProperties: true }
);
const OpJsonC = TypeCompiler.Compile(OpJson);
export type OpJson = Static<typeof OpJson>;

export function inscriptionContentToJson(inscription: DbInscriptionInsert): OpJson | undefined {
  if (
    inscription.mime_type.startsWith('text/plain') ||
    inscription.mime_type.startsWith('application/json')
  ) {
    try {
      const buf =
        typeof inscription.content === 'string'
          ? hexToBuffer(inscription.content)
          : inscription.content;
      const result = JSON.parse(buf.toString('utf-8'));
      if (OpJsonC.Check(result)) {
        return result;
      }
    } catch (error) {
      // Not a JSON inscription.
    }
  }
}

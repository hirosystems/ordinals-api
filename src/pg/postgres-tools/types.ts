export const PG_TYPE_MAPPINGS = {
  // Make both `string` and `Buffer` be compatible with a `bytea` columns.
  // * Buffers and strings with `0x` prefixes will be transformed to hex format (`\x`).
  // * Other strings will be passed as-is.
  // From postgres, all values will be returned as strings with `0x` prefix.
  bytea: {
    to: 17,
    from: [17],
    serialize: (x: any) => {
      if (typeof x === 'string') {
        if (/^(0x|0X)[a-fA-F0-9]*$/.test(x)) {
          // hex string with "0x" prefix
          if (x.length % 2 !== 0) {
            throw new Error(`Hex string is an odd number of digits: "${x}"`);
          }
          return '\\x' + x.slice(2);
        } else if (x.length === 0) {
          return '\\x';
        } else if (/^\\x[a-fA-F0-9]*$/.test(x)) {
          // hex string with "\x" prefix (already encoded for postgres)
          if (x.length % 2 !== 0) {
            throw new Error(`Hex string is an odd number of digits: "${x}"`);
          }
          return x;
        } else {
          throw new Error(`String value for bytea column does not have 0x prefix: "${x}"`);
        }
      } else if (Buffer.isBuffer(x)) {
        return '\\x' + x.toString('hex');
      } else if (ArrayBuffer.isView(x)) {
        return '\\x' + Buffer.from(x.buffer, x.byteOffset, x.byteLength).toString('hex');
      } else {
        throw new Error(
          `Cannot serialize unexpected type "${x.constructor.name}" to bytea hex string`
        );
      }
    },
    parse: (x: any) => `0x${x.slice(2)}`,
  },
};

/** Values will be automatically converted into a `bytea` compatible string before sending to pg. */
export type PgBytea = string | Buffer;
/** The `string` type guarantees the value will fit into the `numeric` pg type. */
export type PgNumeric = string;
/** JSON objects will be automatically stringified before insertion. */
export type PgJsonb = any;

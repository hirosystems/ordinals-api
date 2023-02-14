import { fetch as undiciFetch, Headers, Request, RequestInit, Response } from 'undici';
import * as createError from '@fastify/error';
import * as c32check from 'c32check';
import { Static, TSchema, Type } from '@sinclair/typebox';
import * as btc from 'bitcoinjs-lib';
import BigNumber from 'bignumber.js';
import {
  bufferCV,
  ClarityValue,
  contractPrincipalCV,
  falseCV,
  intCV,
  listCV,
  noneCV,
  standardPrincipalCV,
  stringAsciiCV,
  stringUtf8CV,
  trueCV,
  tupleCV,
  uintCV,
} from '@stacks/transactions';

const defaultFetchTimeout = 15_000; // 15 seconds

function throwFetchError(...args: [Error, string] | [string] | [Error]): never {
  if (args.length === 2) {
    const FetchError = createError('FETCH_ERROR', 'Server fetch error: %s', 500);
    throw new FetchError(args[1]);
  } else {
    const FetchError = createError('FETCH_ERROR', 'Server fetch error: %s', 500);
    throw new FetchError(args[0]);
  }
}

export async function fetchJson<TOkResponse = unknown, TErrorResponse = unknown>(args: {
  url: URL;
  init?: RequestInit | undefined;
  timeoutMs?: number;
}): Promise<
  (
    | {
        result: 'ok';
        status: number;
        response: TOkResponse;
      }
    | {
        result: 'error';
        status: number;
        response: TErrorResponse;
      }
  ) & { getCurlCmd: () => string }
> {
  const requestInit: RequestInit = {
    signal: (AbortSignal as any).timeout(args.timeoutMs ?? defaultFetchTimeout),
    ...args.init,
  };
  const headers = new Headers(requestInit.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  requestInit.headers = headers;
  const req = new Request(args.url, requestInit);

  const getCurlCmd = () => {
    let curl = `curl -i -X ${req.method} '${req.url}'`;
    if (args.init?.body) {
      if (typeof args.init.body === 'string') {
        curl += ` -H 'Content-Type: application/json' -d '${args.init.body.replace(
          /'/g,
          `'\\''`
        )}'`;
      } else {
        throw new Error(`Can only create curl command for request bodies with string type`);
      }
    }
    return curl;
  };

  let resp: Response;
  try {
    resp = await undiciFetch(req);
  } catch (error) {
    const errorMsg = `${req.method} ${req.url} - error performing fetch: ${error}`;
    throwFetchError(error as Error, errorMsg);
  }

  let respText = '';
  try {
    respText = await resp.text();
  } catch (error) {
    const errorMsg = `${req.method} ${req.url} - error reading response ${resp.status}: ${respText}`;
    throwFetchError(error as Error, errorMsg);
  }

  let respBody: unknown;
  try {
    respBody = JSON.parse(respText);
  } catch (error) {
    if (resp.ok) {
      const errorMsg = `${req.method} ${req.url} - error parsing JSON response ${resp.status}: ${respText}`;
      throwFetchError(error as Error, errorMsg);
    }
  }

  if (resp.ok) {
    return {
      result: 'ok',
      status: resp.status,
      response: respBody as TOkResponse,
      getCurlCmd,
    };
  } else {
    return {
      result: 'error',
      status: resp.status,
      response: (respBody ?? respText) as TErrorResponse,
      getCurlCmd,
    };
  }
}

/** Provide either a Stacks or Bitcoin address, and receive the Stacks address, Bitcoin address, and network version */
export function getAddressInfo(addr: string, network: 'mainnet' | 'testnet' = 'mainnet') {
  let b58addr: string;
  if (addr.match(/^S[0123456789ABCDEFGHJKMNPQRSTVWXYZ]+$/)) {
    b58addr = c32check.c32ToB58(addr);
  } else if (addr.match(/[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+/)) {
    b58addr = addr;
  } else {
    throw new Error(`Unrecognized address ${addr}`);
  }

  let stxAddr = c32check.b58ToC32(b58addr);

  const decodedStxAddr = c32check.c32addressDecode(stxAddr);

  // Check if address needs coerced from one network version to another
  if (network) {
    if (
      network === 'mainnet' &&
      decodedStxAddr[0] !== c32check.versions.mainnet.p2pkh &&
      decodedStxAddr[0] !== c32check.versions.mainnet.p2sh
    ) {
      if (decodedStxAddr[0] === c32check.versions.testnet.p2pkh) {
        decodedStxAddr[0] = c32check.versions.mainnet.p2pkh;
      } else if (decodedStxAddr[0] === c32check.versions.testnet.p2sh) {
        decodedStxAddr[0] = c32check.versions.testnet.p2pkh;
      } else {
        throw new Error(
          `Cannot convert address network type, unknown network version: ${decodedStxAddr[0]}`
        );
      }
    } else if (
      network === 'testnet' &&
      decodedStxAddr[0] !== c32check.versions.testnet.p2pkh &&
      decodedStxAddr[0] !== c32check.versions.testnet.p2sh
    ) {
      if (decodedStxAddr[0] === c32check.versions.mainnet.p2pkh) {
        decodedStxAddr[0] = c32check.versions.testnet.p2pkh;
      } else if (decodedStxAddr[0] === c32check.versions.mainnet.p2sh) {
        decodedStxAddr[0] = c32check.versions.testnet.p2pkh;
      } else {
        throw new Error(
          `Cannot convert address network type, unknown network version: ${decodedStxAddr[0]}`
        );
      }
    }
    stxAddr = c32check.c32address(decodedStxAddr[0], decodedStxAddr[1]);
    b58addr = c32check.c32ToB58(stxAddr);
  }

  let networkName = 'other';
  if (
    decodedStxAddr[0] === c32check.versions.testnet.p2pkh ||
    decodedStxAddr[0] === c32check.versions.testnet.p2sh
  ) {
    networkName = 'testnet';
  } else if (
    decodedStxAddr[0] === c32check.versions.mainnet.p2pkh ||
    decodedStxAddr[0] === c32check.versions.mainnet.p2sh
  ) {
    networkName = 'mainnet';
  }

  return {
    stacks: stxAddr,
    bitcoin: b58addr,
    network: networkName,
  };
}

export function TypeNullable<T extends TSchema>(schema: T) {
  return Type.Unsafe<Static<T> | null>({ ...schema, nullable: true });
}

/**
 * Parse Stacks Leader Block Commit data from a Bitcoin tx output script. Returns null if script is not a Leader Block Commit.
 * https://github.com/stacksgov/sips/blob/main/sips/sip-001/sip-001-burn-election.md#leader-block-commit
 */
export function decodeLeaderBlockCommit(txOutScript: string) {
  // Total byte length w/ OP_RETURN and lead block commit message is 83 bytes
  if (txOutScript.length !== 166) {
    return null;
  }

  const opReturnHex = '6a';
  if (!txOutScript.startsWith(opReturnHex)) {
    return null;
  }
  const decompiled = btc.script.decompile(Buffer.from(txOutScript, 'hex'));
  if (decompiled?.length !== 2) {
    return null;
  }
  const scriptData = decompiled[1];
  if (!Buffer.isBuffer(scriptData)) {
    return null;
  }

  const magicBytes = [88, 50]; // X2
  if (scriptData[0] !== magicBytes[0] || scriptData[1] !== magicBytes[1]) {
    return null;
  }

  const opLeaderBlockCommit = Buffer.from('[');
  const stxOp = scriptData.subarray(2, 3);
  if (stxOp[0] !== opLeaderBlockCommit[0]) {
    return null;
  }

  // header block hash of the Stacks anchored block
  const blockHash = scriptData.subarray(3, 35);
  const blockHashHex = blockHash.toString('hex');

  // the next value for the VRF seed
  const newSeed = scriptData.subarray(35, 67);
  const newSeedHex = newSeed.toString('hex');

  // the burn block height of this block's parent
  const parentBlock = scriptData.subarray(67, 71);
  const parentBlockInt = parentBlock.readUint32BE(0);

  // the vtxindex for this block's parent's block commit
  const parentTxOffset = scriptData.subarray(71, 73);
  const parentTxOffsetInt = parentTxOffset.readUint16BE(0);

  // the burn block height of the miner's VRF key registration
  const keyBlock = scriptData.subarray(73, 77);
  const keyBlockInt = keyBlock.readUint32BE(0);

  // the vtxindex for this miner's VRF key registration
  const keyTxOffset = scriptData.subarray(77, 79);
  const keyTxOffsetInt = keyTxOffset.readUint16BE(0);

  // the burn block height at which this leader block commit was created modulo BURN_COMMITMENT_WINDOW (=6).
  // That is, if the block commit is included in the intended burn block then this value should be equal to: (commit_burn_height - 1) % 6.
  // This field is used to link burn commitments from the same miner together even if a commitment was included in a late burn block.
  const burnParentModulus = scriptData.subarray(79, 80)[0];

  return {
    blockHash: blockHashHex,
    newSeed: newSeedHex,
    parentBlock: parentBlockInt,
    parentTxOffset: parentTxOffsetInt,
    keyBlock: keyBlockInt,
    keyTxOffset: keyTxOffsetInt,
    burnParentModulus,
  };
}

/**
 * Parse Stacks Leader VRF Key Registration data from a Bitcoin tx output script. Returns null if script is not a Leader VRF Key Registration.
 * https://github.com/stacksgov/sips/blob/main/sips/sip-001/sip-001-burn-election.md#leader-vrf-key-registrations
 */
export function decodeLeaderVrfKeyRegistration(txOutScript: string) {
  const opReturnHex = '6a';
  if (!txOutScript.startsWith(opReturnHex)) {
    return null;
  }
  const decompiled = btc.script.decompile(Buffer.from(txOutScript, 'hex'));
  if (decompiled?.length !== 2) {
    return null;
  }
  const scriptData = decompiled[1];
  if (!Buffer.isBuffer(scriptData)) {
    return null;
  }

  const magicBytes = [88, 50]; // X2
  if (scriptData[0] !== magicBytes[0] || scriptData[1] !== magicBytes[1]) {
    return null;
  }

  const opLeaderVrfKeyRegistration = Buffer.from('^');
  const stxOp = scriptData.subarray(2, 3);
  if (stxOp[0] !== opLeaderVrfKeyRegistration[0]) {
    return null;
  }

  // the current consensus hash for the burnchain state of the Stacks blockchain
  const consensusHash = scriptData.subarray(3, 23);
  const consensusHashHex = consensusHash.toString('hex');

  // the 32-byte public key used in the miner's VRF proof
  const provingPublicKey = scriptData.subarray(23, 55);
  const provingPublicKeyHex = provingPublicKey.toString('hex');

  // a field for including a miner memo
  let memo: string | null = null;
  if (scriptData.length > 55) {
    memo = scriptData.subarray(55).toString('hex');
  }

  return {
    consensusHash: consensusHashHex,
    provingPublicKey: provingPublicKeyHex,
    memo: memo,
  };
}

/**
 * Parse a STX-transfer operation from a Bitcoin tx out script.
 */
export function decodeStxTransferOp(txOutScript: string) {
  const opReturnHex = '6a';
  if (!txOutScript.startsWith(opReturnHex)) {
    return null;
  }
  const decompiled = btc.script.decompile(Buffer.from(txOutScript, 'hex'));
  if (decompiled?.length !== 2) {
    return null;
  }
  const scriptData = decompiled[1];
  if (!Buffer.isBuffer(scriptData)) {
    return null;
  }

  const magicBytes = [88, 50]; // X2
  if (scriptData[0] !== magicBytes[0] || scriptData[1] !== magicBytes[1]) {
    return null;
  }

  const stxTransferOpCode = Buffer.from('$');
  const stxOp = scriptData.subarray(2, 3);
  if (stxOp[0] !== stxTransferOpCode[0]) {
    return null;
  }

  const microAmount = BigInt('0x' + scriptData.subarray(3, 19).toString('hex'));
  const stxAmount = new BigNumber(microAmount.toString()).shiftedBy(-6).toFixed(6);

  return {
    stxAmount: stxAmount,
  };
}

export function cvFromJson(input: unknown): ClarityValue {
  const parseNumberInput = (val: string | number, originalInput: string) => {
    const int = BigInt(val);
    const U128_MAX = 2n ** 128n - 1n;
    const U128_MIN = 0n;
    const I128_MAX = 2n ** 127n - 1n;
    const I128_MIN = (-2n) ** 127n;
    if (int >= U128_MIN && int <= U128_MAX) {
      return uintCV(int);
    } else if (int >= I128_MIN && int <= I128_MAX) {
      return intCV(int);
    } else {
      // Integer string cannot fit into 128 bits so encode as ascii string
      return stringAsciiCV(originalInput);
    }
  };

  if (typeof input === 'string') {
    const inputTrimmed = input.trim();
    // Test if string value is an integer so BigInt can be used rather than losing precision with JSON.parse() or parseInt()
    if (/^[-+]?\d+$/.test(inputTrimmed)) {
      return parseNumberInput(inputTrimmed, input);
    }
  }

  let jsonParsed: unknown;
  if (typeof input === 'string') {
    try {
      jsonParsed = JSON.parse(input);
    } catch (error) {
      // This will throw for regular string inputs that are not another js primitive (number, boolean), or are not an object or array
      jsonParsed = input;
    }
  } else {
    jsonParsed = input;
  }

  if (typeof jsonParsed === 'boolean') {
    return jsonParsed ? trueCV() : falseCV();
  } else if (typeof jsonParsed === 'number') {
    // Can get here if receiving input like `12e+3`
    if (Number.isInteger(jsonParsed)) {
      return parseNumberInput(
        jsonParsed,
        typeof input === 'string' ? input : jsonParsed.toString()
      );
    } else {
      // Input is not an integer (some decimal / or floating point special), encode as ascii string
      return stringAsciiCV(typeof input === 'string' ? input : jsonParsed.toString());
    }
  } else if (typeof jsonParsed === 'string') {
    // check if 0x-prefixed hex string
    if (/^(0x|0X)[a-fA-F0-9]*$/.test(jsonParsed)) {
      // if odd length then add a '0' char prefix
      const prefix = jsonParsed.length % 2 !== 0 ? '0' : '';
      const buff = Buffer.from(`${prefix}${jsonParsed.slice(2)}`, 'hex');
      return bufferCV(buff);
    } else if (/^[\x00-\x7F]*$/.test(jsonParsed)) {
      // only contains ascii
      if (jsonParsed.split('.').length === 2) {
        // possible contract principal
        const [address, contractName] = jsonParsed.split('.');
        try {
          return contractPrincipalCV(address, contractName);
        } catch (error) {
          // ignore, this throws if the address is not a valid C32 Stacks address
        }
      }
      try {
        // possible standard principal
        return standardPrincipalCV(jsonParsed);
      } catch (error) {
        // ignore, this throws if the address is not a valid C32 Stacks address
      }
      return stringAsciiCV(jsonParsed);
    } else {
      // otherwise encode as utf8
      return stringUtf8CV(jsonParsed);
    }
  } else if (jsonParsed === null) {
    // handle case of input string "null" as an OptionalNone
    return noneCV();
  } else if (Array.isArray(jsonParsed)) {
    const arrayVals: ClarityValue[] = [];
    for (const item of jsonParsed) {
      arrayVals.push(cvFromJson(item));
    }
    return listCV(arrayVals);
  } else if (typeof jsonParsed === 'object') {
    const tupleVals: Record<string, ClarityValue> = {};
    for (const [name, val] of Object.entries(jsonParsed)) {
      tupleVals[name] = cvFromJson(val);
    }
    return tupleCV(tupleVals);
  }
  throw new Error(`Unexpected value: ${JSON.stringify(input)}`);
}

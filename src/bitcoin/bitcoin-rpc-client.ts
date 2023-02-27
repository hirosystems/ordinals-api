import { request } from 'undici';
import { ENV } from '../env';
import { Block, Transaction } from './types';

type RpcParam = string | number | boolean;

/**
 * x
 */
export class BitcoinRpcClient {
  private readonly rpcUrl: string;

  constructor() {
    this.rpcUrl = `http://${ENV.BITCOIN_RPC_HOST}:${ENV.BITCOIN_RPC_PORT}/`;
  }

  async getChainTipBlockHeight(): Promise<number> {
    return this.sendRpcCall('getblockcount');
  }

  async getBlockHash(args: { height: number }): Promise<string> {
    return this.sendRpcCall('getblockhash', [args.height]);
  }

  async getBlock(args: { hash: string }): Promise<Block> {
    return this.sendRpcCall('getblock', [args.hash]);
  }

  async getTransaction(args: { txId: string; blockHash?: string }): Promise<Transaction> {
    const params = [args.txId, true];
    if (args.blockHash) params.push(args.blockHash);
    return this.sendRpcCall('getrawtransaction', params);
  }

  private async sendRpcCall<T>(method: string, params: RpcParam[] = []): Promise<T> {
    const body = {
      jsonrpc: '1.0',
      method: method,
      params: params,
    };
    const result = await request(this.rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // TODO: Make this configurable.
        authorization: 'Basic cmFmYWVsY3I6ZGV2ZWxvcGVy',
      },
      body: JSON.stringify(body),
      throwOnError: true,
    });
    const json = await result.body.json();
    return json.result as T;
  }
}

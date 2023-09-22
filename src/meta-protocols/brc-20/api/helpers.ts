import BigNumber from 'bignumber.js';
import {
  Brc20TokenResponse,
  Brc20Supply,
  Brc20BalanceResponse,
  Brc20ActivityResponse,
  Brc20HolderResponse,
} from '../../../api/schemas';
import {
  DbBrc20Token,
  DbBrc20TokenWithSupply,
  DbBrc20Balance,
  DbBrc20Activity,
  DbBrc20EventOperation,
  DbBrc20Holder,
} from '../pg/types';

function decimals(num: string, decimals: number): string {
  return new BigNumber(num).toFixed(decimals);
}

export function parseBrc20Tokens(items: DbBrc20Token[]): Brc20TokenResponse[] {
  return items.map(i => ({
    id: i.genesis_id,
    number: parseInt(i.number),
    block_height: parseInt(i.block_height),
    tx_id: i.tx_id,
    address: i.address,
    ticker: i.ticker,
    max_supply: decimals(i.max, i.decimals),
    mint_limit: i.limit ? decimals(i.limit, i.decimals) : null,
    decimals: i.decimals,
    deploy_timestamp: i.timestamp.valueOf(),
    minted_supply: decimals(i.minted_supply, i.decimals),
    tx_count: parseInt(i.tx_count),
  }));
}

export function parseBrc20Supply(item: DbBrc20TokenWithSupply): Brc20Supply {
  return {
    max_supply: decimals(item.max, item.decimals),
    minted_supply: decimals(item.minted_supply, item.decimals),
    holders: parseInt(item.holders),
  };
}

export function parseBrc20Balances(items: DbBrc20Balance[]): Brc20BalanceResponse[] {
  return items.map(i => ({
    ticker: i.ticker,
    available_balance: decimals(i.avail_balance, i.decimals),
    transferrable_balance: decimals(i.trans_balance, i.decimals),
    overall_balance: decimals(i.total_balance, i.decimals),
  }));
}

export function parseBrc20Activities(items: DbBrc20Activity[]): Brc20ActivityResponse[] {
  return items.map(i => {
    const activity = {
      operation: i.operation,
      ticker: i.ticker,
      address: i.address,
      tx_id: i.tx_id,
      inscription_id: i.inscription_id,
      location: `${i.output}:${i.offset}`,
      block_hash: i.block_hash,
      block_height: parseInt(i.block_height),
      timestamp: i.timestamp.valueOf(),
    };
    switch (i.operation) {
      case DbBrc20EventOperation.deploy: {
        return {
          ...activity,
          deploy: {
            max_supply: decimals(i.deploy_max, i.deploy_decimals),
            mint_limit: i.deploy_limit ? decimals(i.deploy_limit, i.deploy_decimals) : null,
            decimals: i.deploy_decimals,
          },
        };
      }
      case DbBrc20EventOperation.mint: {
        return {
          ...activity,
          mint: {
            amount: decimals(i.mint_amount, i.deploy_decimals),
          },
        };
      }
      case DbBrc20EventOperation.transfer: {
        const [amount, from_address] = i.transfer_data.split(';');
        return {
          ...activity,
          transfer: { amount: decimals(amount, i.deploy_decimals), from_address },
        };
      }
      case DbBrc20EventOperation.transferSend: {
        const [amount, from_address, to_address] = i.transfer_data.split(';');
        return {
          ...activity,
          transfer_send: { amount: decimals(amount, i.deploy_decimals), from_address, to_address },
        };
      }
    }
  });
}

export function parseBrc20Holders(items: DbBrc20Holder[]): Brc20HolderResponse[] {
  return items.map(i => ({
    address: i.address,
    overall_balance: decimals(i.total_balance, i.decimals),
  }));
}

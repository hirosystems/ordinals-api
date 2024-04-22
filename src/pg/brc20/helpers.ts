import BigNumber from 'bignumber.js';
import { DbBrc20Operation } from './types';

export function increaseOperationCount(
  map: Map<DbBrc20Operation, number>,
  operation: DbBrc20Operation
) {
  const current = map.get(operation);
  if (current == undefined) {
    map.set(operation, 1);
  } else {
    map.set(operation, current + 1);
  }
}

export function increaseTokenMintedSupply(
  map: Map<string, BigNumber>,
  ticker: string,
  amount: BigNumber
) {
  const current = map.get(ticker);
  if (current == undefined) {
    map.set(ticker, amount);
  } else {
    map.set(ticker, current.plus(amount));
  }
}

export function increaseTokenTxCount(map: Map<string, number>, ticker: string, delta: number) {
  const current = map.get(ticker);
  if (current == undefined) {
    map.set(ticker, 1);
  } else {
    map.set(ticker, current + delta);
  }
}

export function increaseAddressOperationCount(
  map: Map<string, Map<DbBrc20Operation, number>>,
  address: string,
  operation: DbBrc20Operation
) {
  const current = map.get(address);
  if (current == undefined) {
    const opMap = new Map<DbBrc20Operation, number>();
    increaseOperationCount(opMap, operation);
    map.set(address, opMap);
  } else {
    increaseOperationCount(current, operation);
  }
}

export interface AddressBalanceData {
  avail: BigNumber;
  trans: BigNumber;
  total: BigNumber;
}
export function updateAddressBalance(
  map: Map<string, Map<string, AddressBalanceData>>,
  ticker: string,
  address: string,
  availBalance: BigNumber,
  transBalance: BigNumber,
  totalBalance: BigNumber
) {
  const current = map.get(address);
  if (current === undefined) {
    const opMap = new Map<string, AddressBalanceData>();
    opMap.set(ticker, { avail: availBalance, trans: transBalance, total: totalBalance });
    map.set(address, opMap);
  } else {
    const currentTick = current.get(ticker);
    if (currentTick === undefined) {
      current.set(ticker, { avail: availBalance, trans: transBalance, total: totalBalance });
    } else {
      current.set(ticker, {
        avail: availBalance.plus(currentTick.avail),
        trans: transBalance.plus(currentTick.trans),
        total: totalBalance.plus(currentTick.total),
      });
    }
  }
}

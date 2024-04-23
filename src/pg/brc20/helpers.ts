import BigNumber from 'bignumber.js';
import { DbBrc20Operation, DbBrc20OperationInsert, DbBrc20TokenInsert } from './types';
import * as postgres from 'postgres';
import { PgSqlClient } from '@hirosystems/api-toolkit';

export function sqlOr(
  sql: PgSqlClient,
  partials: postgres.PendingQuery<postgres.Row[]>[] | undefined
) {
  return partials?.reduce((acc, curr) => sql`${acc} OR ${curr}`);
}

export interface AddressBalanceData {
  avail: BigNumber;
  trans: BigNumber;
  total: BigNumber;
}

export class Brc20BlockCache {
  tokens: DbBrc20TokenInsert[] = [];
  operations: DbBrc20OperationInsert[] = [];
  tokenMintSupplies = new Map<string, BigNumber>();
  tokenTxCounts = new Map<string, number>();
  operationCounts = new Map<DbBrc20Operation, number>();
  addressOperationCounts = new Map<string, Map<DbBrc20Operation, number>>();
  totalBalanceChanges = new Map<string, Map<string, AddressBalanceData>>();
  transferReceivers = new Map<string, string>();

  increaseOperationCount(operation: DbBrc20Operation) {
    this.increaseOperationCountInternal(this.operationCounts, operation);
  }
  private increaseOperationCountInternal(
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

  increaseTokenMintedSupply(ticker: string, amount: BigNumber) {
    const current = this.tokenMintSupplies.get(ticker);
    if (current == undefined) {
      this.tokenMintSupplies.set(ticker, amount);
    } else {
      this.tokenMintSupplies.set(ticker, current.plus(amount));
    }
  }

  increaseTokenTxCount(ticker: string) {
    const current = this.tokenTxCounts.get(ticker);
    if (current == undefined) {
      this.tokenTxCounts.set(ticker, 1);
    } else {
      this.tokenTxCounts.set(ticker, current + 1);
    }
  }

  increaseAddressOperationCount(address: string, operation: DbBrc20Operation) {
    const current = this.addressOperationCounts.get(address);
    if (current == undefined) {
      const opMap = new Map<DbBrc20Operation, number>();
      this.increaseOperationCountInternal(opMap, operation);
      this.addressOperationCounts.set(address, opMap);
    } else {
      this.increaseOperationCountInternal(current, operation);
    }
  }

  updateAddressBalance(
    ticker: string,
    address: string,
    availBalance: BigNumber,
    transBalance: BigNumber,
    totalBalance: BigNumber
  ) {
    const current = this.totalBalanceChanges.get(address);
    if (current === undefined) {
      const opMap = new Map<string, AddressBalanceData>();
      opMap.set(ticker, { avail: availBalance, trans: transBalance, total: totalBalance });
      this.totalBalanceChanges.set(address, opMap);
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
}

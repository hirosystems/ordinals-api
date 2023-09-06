/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('brc20_total_balances', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    brc20_deploy_id: {
      type: 'bigint',
      notNull: true,
    },
    address: {
      type: 'text',
      notNull: true,
    },
    avail_balance: {
      type: 'numeric',
      notNull: true,
    },
    trans_balance: {
      type: 'numeric',
      notNull: true,
    },
    total_balance: {
      type: 'numeric',
      notNull: true,
    },
  });
  pgm.createConstraint(
    'brc20_total_balances',
    'brc20_total_balances_brc20_deploy_id_fk',
    'FOREIGN KEY(brc20_deploy_id) REFERENCES brc20_deploys(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'brc20_total_balances',
    'brc20_total_balances_unique',
    'UNIQUE(brc20_deploy_id, address)'
  );
  pgm.createIndex('brc20_total_balances', ['address']);
  pgm.createIndex('brc20_total_balances', [
    'brc20_deploy_id',
    { name: 'total_balance', sort: 'DESC' },
  ]);
}

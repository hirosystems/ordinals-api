/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('brc20_balances', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    inscription_id: {
      type: 'bigint',
      notNull: true,
    },
    brc20_deploy_id: {
      type: 'bigint',
      notNull: true,
    },
    block_height: {
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
  });
  pgm.createConstraint(
    'brc20_balances',
    'brc20_balances_inscription_id_fk',
    'FOREIGN KEY(inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'brc20_balances',
    'brc20_balances_brc20_deploy_id_fk',
    'FOREIGN KEY(brc20_deploy_id) REFERENCES brc20_deploys(id) ON DELETE CASCADE'
  );
  pgm.createIndex('brc20_balances', ['inscription_id']);
  pgm.createIndex('brc20_balances', ['brc20_deploy_id']);
  pgm.createIndex('brc20_balances', ['address']);
}

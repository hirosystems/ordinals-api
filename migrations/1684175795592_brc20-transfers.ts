/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('brc20_transfers', {
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
    tx_id: {
      type: 'text',
      notNull: true,
    },
    from_address: {
      type: 'text',
      notNull: true,
    },
    to_address: {
      type: 'text',
    },
    amount: {
      type: 'numeric',
      notNull: true,
    },
  });
  pgm.createConstraint(
    'brc20_transfers',
    'brc20_transfers_inscription_id_fk',
    'FOREIGN KEY(inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'brc20_transfers',
    'brc20_transfers_brc20_deploy_id_fk',
    'FOREIGN KEY(brc20_deploy_id) REFERENCES brc20_deploys(id) ON DELETE CASCADE'
  );
  pgm.createIndex('brc20_transfers', ['inscription_id']);
  pgm.createIndex('brc20_transfers', ['brc20_deploy_id']);
  pgm.createIndex('brc20_transfers', ['block_height']);
  pgm.createIndex('brc20_transfers', ['from_address']);
  pgm.createIndex('brc20_transfers', ['to_address']);
}

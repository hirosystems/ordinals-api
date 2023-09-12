/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('brc20_events', {
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
    deploy_id: {
      type: 'bigint',
    },
    mint_id: {
      type: 'bigint',
    },
    transfer_id: {
      type: 'bigint',
    },
  });
  pgm.createConstraint(
    'brc20_events',
    'brc20_events_inscription_id_fk',
    'FOREIGN KEY(inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'brc20_events',
    'brc20_events_brc20_deploy_id_fk',
    'FOREIGN KEY(brc20_deploy_id) REFERENCES brc20_deploys(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'brc20_events',
    'brc20_events_deploy_id_fk',
    'FOREIGN KEY(deploy_id) REFERENCES brc20_deploys(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'brc20_events',
    'brc20_events_mint_id_fk',
    'FOREIGN KEY(mint_id) REFERENCES brc20_mints(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'brc20_events',
    'brc20_events_transfer_id_fk',
    'FOREIGN KEY(transfer_id) REFERENCES brc20_transfers(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'brc20_events',
    'brc20_valid_event',
    'CHECK(NUM_NONNULLS(deploy_id, mint_id, transfer_id) = 1)'
  );
}

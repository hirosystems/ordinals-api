/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('brc20_operation', ['deploy', 'mint', 'transfer', 'transfer_send']);
  pgm.addColumns('brc20_events', {
    genesis_location_id: {
      type: 'bigint',
      references: '"locations"',
      onDelete: 'CASCADE',
      notNull: true,
      unique: true, // only one event exists per location
    },
    operation: {
      type: 'brc20_operation',
      notNull: true,
    },
  });

  pgm.createIndex('brc20_events', ['genesis_location_id']);
  pgm.createIndex('brc20_events', ['operation']);

  pgm.createIndex('brc20_events', ['brc20_deploy_id']);
  pgm.createIndex('brc20_events', ['transfer_id']);
  pgm.createIndex('brc20_events', ['mint_id']);

  pgm.sql(`
    INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, deploy_id) (
      SELECT 'deploy', d.inscription_id, g.location_id, d.id, d.id
      FROM brc20_deploys AS d
      INNER JOIN genesis_locations AS g ON g.inscription_id = d.inscription_id
    )
  `);
  pgm.sql(`
    INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, mint_id) (
      SELECT 'mint', m.inscription_id, g.location_id, m.brc20_deploy_id, m.id
      FROM brc20_mints AS m
      INNER JOIN genesis_locations AS g ON g.inscription_id = m.inscription_id
    )
  `);
  pgm.sql(`
    INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, transfer_id) (
      SELECT 'transfer', t.inscription_id, g.location_id, t.brc20_deploy_id, t.id
      FROM brc20_transfers AS t
      INNER JOIN genesis_locations AS g ON g.inscription_id = t.inscription_id
    )
  `);
  pgm.sql(`
    INSERT INTO brc20_events (operation, inscription_id, genesis_location_id, brc20_deploy_id, transfer_id) (
      SELECT 'transfer_send', inscription_id, location_id, brc20_deploy_id, inscription_id
      FROM brc20_balances
      WHERE type = 3
    )
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('brc20_events', ['genesis_location_id']);
  pgm.dropIndex('brc20_events', ['operation']);
  pgm.dropColumns('brc20_events', ['genesis_location_id', 'operation']);
  pgm.dropIndex('brc20_events', ['brc20_deploy_id']);
  pgm.dropIndex('brc20_events', ['transfer_id']);
  pgm.dropIndex('brc20_events', ['mint_id']);
  pgm.dropType('brc20_operation');
}

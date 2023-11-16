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

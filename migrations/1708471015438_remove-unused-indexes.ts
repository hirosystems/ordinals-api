/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('locations', ['prev_output']);
  pgm.dropIndex('locations', ['address']);
  pgm.dropIndex('current_locations', ['block_height']);
  pgm.dropIndex('brc20_mints', ['address']);
  pgm.dropIndex('brc20_mints', ['block_height']);
  pgm.dropIndex('brc20_mints', ['brc20_deploy_id']);
  pgm.dropIndex('brc20_transfers', ['to_address']);
  pgm.dropIndex('brc20_transfers', ['from_address']);
  pgm.dropIndex('brc20_transfers', ['brc20_deploy_id']);
  pgm.dropIndex('brc20_transfers', ['block_height']);
  pgm.dropIndex('brc20_deploys', ['address']);
  pgm.dropIndex('brc20_deploys', ['block_height']);
  pgm.dropIndex('inscription_recursions', ['ref_inscription_genesis_id']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.createIndex('locations', ['prev_output']);
  pgm.createIndex('locations', ['address']);
  pgm.createIndex('current_locations', ['block_height']);
  pgm.createIndex('brc20_mints', ['address']);
  pgm.createIndex('brc20_mints', ['block_height']);
  pgm.createIndex('brc20_mints', ['brc20_deploy_id']);
  pgm.createIndex('brc20_transfers', ['to_address']);
  pgm.createIndex('brc20_transfers', ['from_address']);
  pgm.createIndex('brc20_transfers', ['brc20_deploy_id']);
  pgm.createIndex('brc20_transfers', ['block_height']);
  pgm.createIndex('brc20_deploys', ['address']);
  pgm.createIndex('brc20_deploys', ['block_height']);
  pgm.createIndex('inscription_recursions', ['ref_inscription_genesis_id']);
}

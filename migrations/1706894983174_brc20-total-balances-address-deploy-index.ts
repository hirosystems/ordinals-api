/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('brc20_total_balances', ['address']);
  pgm.createIndex('brc20_total_balances', ['address', 'brc20_deploy_id']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('brc20_total_balances', ['address', 'brc20_deploy_id']);
  pgm.createIndex('brc20_total_balances', ['address']);
}

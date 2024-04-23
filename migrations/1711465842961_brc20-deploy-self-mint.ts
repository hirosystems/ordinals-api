/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('brc20_deploys', {
    self_mint: {
      type: 'boolean',
      default: 'false',
    },
  });
  pgm.sql(`UPDATE brc20_deploys SET self_mint = false`);
  pgm.alterColumn('brc20_deploys', 'self_mint', { notNull: true });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn('brc20_deploys', ['self_mint']);
}

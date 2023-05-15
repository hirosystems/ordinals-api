/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('inscriptions_per_block', {
    block_height: {
      type: 'int',
      primaryKey: true,
    },
    inscriptions: {
      type: 'int',
      notNull: true,
    },
    inscriptions_total: {
      type: 'int',
      notNull: true,
    },
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('inscriptions_per_block');
}

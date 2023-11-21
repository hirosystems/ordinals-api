/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('locations', {
    block_transfer_index: {
      type: 'int',
    },
  });
  pgm.addIndex('locations', ['block_height', { name: 'block_transfer_index', sort: 'DESC' }]);
  pgm.addIndex('locations', ['block_hash', { name: 'block_transfer_index', sort: 'DESC' }]);
}

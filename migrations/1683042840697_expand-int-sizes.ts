/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.alterColumn('inscriptions', 'id', { type: 'bigint' });
  pgm.alterColumn('inscriptions', 'number', { type: 'bigint' });
  pgm.alterColumn('inscriptions', 'content_length', { type: 'bigint' });

  pgm.alterColumn('locations', 'id', { type: 'bigint' });
  pgm.alterColumn('locations', 'inscription_id', { type: 'bigint' });
  pgm.alterColumn('locations', 'block_height', { type: 'bigint' });
  pgm.alterColumn('locations', 'sat_coinbase_height', { type: 'bigint' });

  pgm.alterColumn('json_contents', 'id', { type: 'bigint' });
  pgm.alterColumn('json_contents', 'inscription_id', { type: 'bigint' });
}

export function down(pgm: MigrationBuilder): void {
  pgm.alterColumn('inscriptions', 'id', { type: 'int' });
  pgm.alterColumn('inscriptions', 'number', { type: 'int' });
  pgm.alterColumn('inscriptions', 'content_length', { type: 'int' });

  pgm.alterColumn('locations', 'id', { type: 'int' });
  pgm.alterColumn('locations', 'inscription_id', { type: 'int' });
  pgm.alterColumn('locations', 'block_height', { type: 'int' });
  pgm.alterColumn('locations', 'sat_coinbase_height', { type: 'int' });

  pgm.alterColumn('json_contents', 'id', { type: 'int' });
  pgm.alterColumn('json_contents', 'inscription_id', { type: 'int' });
}

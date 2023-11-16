/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createMaterializedView(
    'address_counts',
    { data: true },
    `SELECT address, COUNT(*) AS count FROM current_locations GROUP BY address`
  );
  pgm.createIndex('address_counts', ['address'], { unique: true });
}

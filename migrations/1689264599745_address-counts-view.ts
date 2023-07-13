/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createMaterializedView(
    'address_counts',
    { data: true },
    `SELECT l.address, COUNT(*) AS count
    FROM current AS c
    INNER JOIN locations AS l ON c.location_id = l.id
    GROUP BY l.address`
  );
  pgm.createIndex('address_counts', ['address'], { unique: true });
}

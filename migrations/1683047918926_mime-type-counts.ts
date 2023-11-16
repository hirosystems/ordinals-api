/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createMaterializedView(
    'mime_type_counts',
    { data: true },
    `SELECT mime_type, COUNT(*) AS count FROM inscriptions GROUP BY mime_type`
  );
  pgm.createIndex('mime_type_counts', ['mime_type'], { unique: true });
}

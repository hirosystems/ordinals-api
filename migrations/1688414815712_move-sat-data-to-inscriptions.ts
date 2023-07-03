/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('inscriptions', {
    sat_ordinal: {
      type: 'numeric',
      notNull: true,
    },
    sat_rarity: {
      type: 'text',
      notNull: true,
    },
    sat_coinbase_height: {
      type: 'int',
      notNull: true,
    },
  });
  pgm.createIndex('inscriptions', ['sat_ordinal']);
  pgm.createIndex('inscriptions', ['sat_rarity']);
  pgm.createIndex('inscriptions', ['sat_coinbase_height']);

  pgm.dropIndex('locations', ['sat_ordinal']);
  pgm.dropIndex('locations', ['sat_rarity']);
  pgm.dropIndex('locations', ['sat_coinbase_height']);
  pgm.dropColumn('locations', ['sat_ordinal']);
  pgm.dropColumn('locations', ['sat_rarity']);
  pgm.dropColumn('locations', ['sat_coinbase_height']);
}

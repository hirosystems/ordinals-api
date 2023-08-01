/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropMaterializedView('mime_type_counts');
  pgm.createTable('counts_by_mime_type', {
    mime_type: {
      type: 'text',
      notNull: true,
      primaryKey: true,
    },
    count: {
      type: 'bigint',
      notNull: true,
      default: 1,
    },
  });
  pgm.sql(`
    INSERT INTO counts_by_mime_type (
      SELECT mime_type, COUNT(*) AS count FROM inscriptions GROUP BY mime_type
    )
  `);

  pgm.dropMaterializedView('sat_rarity_counts');
  pgm.createTable('counts_by_sat_rarity', {
    sat_rarity: {
      type: 'text',
      notNull: true,
      primaryKey: true,
    },
    count: {
      type: 'bigint',
      notNull: true,
      default: 1,
    },
  });
  pgm.sql(`
    INSERT INTO counts_by_sat_rarity (
      SELECT sat_rarity, COUNT(*) AS count FROM inscriptions GROUP BY sat_rarity
    )
  `);

  pgm.dropMaterializedView('address_counts');
  pgm.createTable('counts_by_address', {
    address: {
      type: 'text',
      notNull: true,
      primaryKey: true,
    },
    count: {
      type: 'bigint',
      notNull: true,
      default: 1,
    },
  });
  pgm.sql(`
    INSERT INTO counts_by_address (
      SELECT address, COUNT(*) AS count FROM current_locations GROUP BY address
    )
  `);

  pgm.createTable('counts_by_genesis_address', {
    address: {
      type: 'text',
      notNull: true,
      primaryKey: true,
    },
    count: {
      type: 'bigint',
      notNull: true,
      default: 1,
    },
  });
  pgm.sql(`
    INSERT INTO counts_by_genesis_address (
      SELECT address, COUNT(*) AS count FROM genesis_locations GROUP BY address
    )
  `);

  pgm.dropMaterializedView('inscription_count');
  pgm.createTable('counts_by_type', {
    type: {
      type: 'text',
      notNull: true,
      primaryKey: true,
    },
    count: {
      type: 'bigint',
      notNull: true,
      default: 1,
    },
  });
  pgm.sql(`
    INSERT INTO counts_by_type (
      SELECT 'blessed' AS type, COUNT(*) AS count FROM inscriptions WHERE number >= 0
    )
  `);
  pgm.sql(`
    INSERT INTO counts_by_type (
      SELECT 'cursed' AS type, COUNT(*) AS count FROM inscriptions WHERE number < 0
    )
  `);

  pgm.createIndex('inscriptions_per_block', ['block_hash']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('counts_by_mime_type');
  pgm.createMaterializedView(
    'mime_type_counts',
    { data: true },
    `SELECT mime_type, COUNT(*) AS count FROM inscriptions GROUP BY mime_type`
  );
  pgm.createIndex('mime_type_counts', ['mime_type'], { unique: true });

  pgm.dropTable('counts_by_sat_rarity');
  pgm.createMaterializedView(
    'sat_rarity_counts',
    { data: true },
    `
    SELECT sat_rarity, COUNT(*) AS count
    FROM inscriptions AS i
    GROUP BY sat_rarity
    `
  );
  pgm.createIndex('sat_rarity_counts', ['sat_rarity'], { unique: true });

  pgm.dropTable('counts_by_address');
  pgm.createMaterializedView(
    'address_counts',
    { data: true },
    `SELECT address, COUNT(*) AS count FROM current_locations GROUP BY address`
  );
  pgm.createIndex('address_counts', ['address'], { unique: true });

  pgm.dropTable('counts_by_type');
  pgm.createMaterializedView(
    'inscription_count',
    { data: true },
    `SELECT COUNT(*) AS count FROM inscriptions`
  );
  pgm.createIndex('inscription_count', ['count'], { unique: true });

  pgm.dropIndex('inscriptions_per_block', ['block_hash']);

  pgm.dropTable('counts_by_genesis_address');
}

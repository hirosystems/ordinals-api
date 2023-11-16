/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropConstraint('genesis_locations', 'genesis_locations_inscription_id_unique');
  pgm.createConstraint('genesis_locations', 'genesis_locations_inscription_id_pk', {
    primaryKey: 'inscription_id',
  });
  pgm.createConstraint(
    'genesis_locations',
    'genesis_locations_inscription_id_fk',
    'FOREIGN KEY(inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'genesis_locations',
    'genesis_locations_location_id_fk',
    'FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE'
  );

  pgm.dropConstraint('current_locations', 'current_locations_inscription_id_unique');
  pgm.createConstraint('current_locations', 'current_locations_inscription_id_pk', {
    primaryKey: 'inscription_id',
  });
  pgm.createConstraint(
    'current_locations',
    'current_locations_inscription_id_fk',
    'FOREIGN KEY(inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'current_locations',
    'current_locations_location_id_fk',
    'FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE'
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropConstraint('genesis_locations', 'genesis_locations_inscription_id_pk');
  pgm.dropConstraint('genesis_locations', 'genesis_locations_inscription_id_fk');
  pgm.dropConstraint('genesis_locations', 'genesis_locations_location_id_fk');
  pgm.createConstraint(
    'genesis_locations',
    'genesis_locations_inscription_id_unique',
    'UNIQUE(inscription_id)'
  );
  pgm.dropConstraint('current_locations', 'current_locations_inscription_id_pk');
  pgm.dropConstraint('current_locations', 'current_locations_inscription_id_fk');
  pgm.dropConstraint('current_locations', 'current_locations_location_id_fk');
  pgm.createConstraint(
    'current_locations',
    'current_locations_inscription_id_unique',
    'UNIQUE(inscription_id)'
  );
}

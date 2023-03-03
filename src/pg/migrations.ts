import * as path from 'path';
import PgMigrate from 'node-pg-migrate';
import { MigrationDirection } from 'node-pg-migrate/dist/types';
import { ENV } from '../env';
import { logger } from '../logger';

export async function runMigrations(direction: MigrationDirection) {
  await PgMigrate({
    direction: direction,
    count: Infinity,
    ignorePattern: '.*map',
    databaseUrl: {
      host: ENV.PGHOST,
      port: ENV.PGPORT,
      user: ENV.PGUSER,
      password: ENV.PGPASSWORD,
      database: ENV.PGDATABASE,
    },
    migrationsTable: 'pgmigrations',
    dir: path.join(__dirname, '../../migrations'),
    logger: {
      info: msg => {},
      warn: msg => logger.warn(msg),
      error: msg => logger.error(msg),
    },
  });
}

export async function cycleMigrations() {
  await runMigrations('down');
  await runMigrations('up');
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('brc20_deploys', {
    ticker_lower: {
      type: 'text',
      notNull: true,
      expressionGenerated: '(LOWER(ticker))',
    },
  });
  pgm.createIndex('brc20_deploys', ['ticker_lower']);
}

import { PgSqlClient } from '@hirosystems/api-toolkit';
import { PgStore } from '../pg-store';
import { SatoshiRarity } from '../../api/util/ordinal-satoshi';
import {
  DbInscription,
  DbInscriptionIndexFilters,
  DbInscriptionInsert,
  DbInscriptionType,
  DbLocation,
  DbLocationInsert,
  DbLocationPointer,
  INSCRIPTIONS_COLUMNS,
} from '../types';
import { DbInscriptionIndexResultCountType } from './types';

/**
 * This class affects all the different tables that track inscription counts according to different
 * parameters (sat rarity, mime type, cursed, blessed, current owner, etc.)
 */
export class CountsPgStore {
  // TODO: Move this to the api-toolkit so we can have pg submodules.
  private readonly parent: PgStore;
  private get sql(): PgSqlClient {
    return this.parent.sql;
  }

  constructor(db: PgStore) {
    this.parent = db;
  }

  async fromResults(
    countType: DbInscriptionIndexResultCountType,
    filters?: DbInscriptionIndexFilters
  ): Promise<number | undefined> {
    switch (countType) {
      case DbInscriptionIndexResultCountType.all:
        return await this.getInscriptionCount();
      case DbInscriptionIndexResultCountType.mimeType:
        return await this.getMimeTypeCount(filters?.mime_type);
      case DbInscriptionIndexResultCountType.satRarity:
        return await this.getSatRarityCount(filters?.sat_rarity);
      case DbInscriptionIndexResultCountType.address:
        return await this.getAddressCount(filters?.address);
    }
  }

  async applyInscription(args: { inscription: DbInscriptionInsert }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      await sql`
        INSERT INTO counts_by_mime_type ${sql({ mime_type: args.inscription.mime_type })}
        ON CONFLICT (mime_type) DO UPDATE SET count = counts_by_mime_type.count + 1
      `;
      await sql`
        INSERT INTO counts_by_sat_rarity ${sql({ sat_rarity: args.inscription.sat_rarity })}
        ON CONFLICT (sat_rarity) DO UPDATE SET count = counts_by_sat_rarity.count + 1
      `;
      await sql`
        INSERT INTO counts_by_type ${sql({
          type: args.inscription.number < 0 ? DbInscriptionType.cursed : DbInscriptionType.blessed,
        })}
        ON CONFLICT (type) DO UPDATE SET count = counts_by_type.count + 1
      `;
    });
  }

  async rollBackInscription(args: { inscription: DbInscription }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      await sql`
        UPDATE counts_by_mime_type SET count = count - 1 WHERE mime_type = ${args.inscription.mime_type}
      `;
      await sql`
        UPDATE counts_by_sat_rarity SET count = count - 1 WHERE sat_rarity = ${args.inscription.sat_rarity}
      `;
      await sql`
        UPDATE counts_by_type SET count = count - 1 WHERE type = ${
          parseInt(args.inscription.number) < 0
            ? DbInscriptionType.cursed
            : DbInscriptionType.blessed
        }
      `;
      await sql`
        UPDATE counts_by_address SET count = count - 1 WHERE address = (
          SELECT address FROM current_locations WHERE inscription_id = ${args.inscription.id}
        )
      `;
    });
  }

  async applyGenesisLocation(args: {
    prev?: DbLocationPointer;
    next: DbLocationPointer;
  }): Promise<void> {
    // Nothing yet.
  }

  async applyCurrentLocation(args: {
    prev?: DbLocationPointer;
    next: DbLocationPointer;
  }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      if (args.prev && args.prev.address) {
        await sql`
          UPDATE counts_by_address SET count = count - 1 WHERE address = ${args.prev.address}
        `;
      }
      if (args.next.address) {
        await sql`
          INSERT INTO counts_by_address ${sql({ address: args.next.address })}
          ON CONFLICT (address) DO UPDATE SET count = counts_by_address.count + 1
        `;
      }
    });
  }

  async rollBackCurrentLocation(args: {
    curr: DbLocationPointer;
    prev: DbLocationPointer;
  }): Promise<void> {
    await this.parent.sqlWriteTransaction(async sql => {
      if (args.curr.address) {
        await sql`
          UPDATE counts_by_address SET count = count - 1 WHERE address = ${args.curr.address}
        `;
      }
      if (args.prev.address) {
        await sql`
          UPDATE counts_by_address SET count = count + 1 WHERE address = ${args.prev.address}
        `;
      }
    });
  }

  private async getInscriptionCount(type?: DbInscriptionType): Promise<number> {
    const types = type ?? [DbInscriptionType.blessed, DbInscriptionType.cursed];
    const result = await this.sql<{ count: number }[]>`
      SELECT COALESCE(SUM(count), 0) AS count
      FROM counts_by_type
      WHERE type IN ${this.sql(types)}
    `;
    return result[0].count;
  }

  private async getMimeTypeCount(mimeType?: string[]): Promise<number> {
    if (!mimeType) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT COALESCE(SUM(count), 0) AS count
      FROM counts_by_mime_type
      WHERE mime_type IN ${this.sql(mimeType)}
    `;
    return result[0].count;
  }

  private async getSatRarityCount(satRarity?: SatoshiRarity[]): Promise<number> {
    if (!satRarity) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT COALESCE(SUM(count), 0) AS count
      FROM counts_by_sat_rarity
      WHERE sat_rarity IN ${this.sql(satRarity)}
    `;
    return result[0].count;
  }

  private async getAddressCount(address?: string[]): Promise<number> {
    if (!address) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT COALESCE(SUM(count), 0) AS count
      FROM counts_by_address
      WHERE address IN ${this.sql(address)}
    `;
    return result[0].count;
  }
}

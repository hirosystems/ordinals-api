import { BasePgStoreModule } from '@hirosystems/api-toolkit';
import { SatoshiRarity } from '../../api/util/ordinal-satoshi';
import {
  DbInscription,
  DbInscriptionIndexFilters,
  DbInscriptionInsert,
  DbInscriptionType,
  DbLocationPointer,
} from '../types';
import { DbInscriptionIndexResultCountType } from './types';

/**
 * This class affects all the different tables that track inscription counts according to different
 * parameters (sat rarity, mime type, cursed, blessed, current owner, etc.)
 */
export class CountsPgStore extends BasePgStoreModule {
  async fromResults(
    countType: DbInscriptionIndexResultCountType,
    filters?: DbInscriptionIndexFilters
  ): Promise<number | undefined> {
    switch (countType) {
      case DbInscriptionIndexResultCountType.all:
        return await this.getInscriptionCount();
      case DbInscriptionIndexResultCountType.cursed:
        return await this.getInscriptionCount(
          filters?.cursed === true ? DbInscriptionType.cursed : DbInscriptionType.blessed
        );
      case DbInscriptionIndexResultCountType.mimeType:
        return await this.getMimeTypeCount(filters?.mime_type);
      case DbInscriptionIndexResultCountType.satRarity:
        return await this.getSatRarityCount(filters?.sat_rarity);
      case DbInscriptionIndexResultCountType.address:
        return await this.getAddressCount(filters?.address);
      case DbInscriptionIndexResultCountType.genesisAddress:
        return await this.getGenesisAddressCount(filters?.genesis_address);
      case DbInscriptionIndexResultCountType.blockHeight:
        return await this.getBlockCount(
          filters?.genesis_block_height,
          filters?.genesis_block_height
        );
      case DbInscriptionIndexResultCountType.fromblockHeight:
        return await this.getBlockCount(filters?.from_genesis_block_height);
      case DbInscriptionIndexResultCountType.toblockHeight:
        return await this.getBlockCount(undefined, filters?.to_genesis_block_height);
      case DbInscriptionIndexResultCountType.blockHeightRange:
        return await this.getBlockCount(
          filters?.from_genesis_block_height,
          filters?.to_genesis_block_height
        );
      case DbInscriptionIndexResultCountType.blockHash:
        return await this.getBlockHashCount(filters?.genesis_block_hash);
    }
  }

  async applyInscription(args: { inscription: DbInscriptionInsert }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
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
    await this.sqlWriteTransaction(async sql => {
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
    old?: DbLocationPointer;
    new: DbLocationPointer;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      if (args.old && args.old.address) {
        await sql`
          UPDATE counts_by_genesis_address SET count = count - 1 WHERE address = ${args.old.address}
        `;
      }
      if (args.new.address) {
        await sql`
          INSERT INTO counts_by_genesis_address ${sql({ address: args.new.address })}
          ON CONFLICT (address) DO UPDATE SET count = counts_by_genesis_address.count + 1
        `;
      }
    });
  }

  async applyCurrentLocation(args: {
    old?: DbLocationPointer;
    new: DbLocationPointer;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      if (args.old && args.old.address) {
        await sql`
          UPDATE counts_by_address SET count = count - 1 WHERE address = ${args.old.address}
        `;
      }
      if (args.new.address) {
        await sql`
          INSERT INTO counts_by_address ${sql({ address: args.new.address })}
          ON CONFLICT (address) DO UPDATE SET count = counts_by_address.count + 1
        `;
      }
    });
  }

  async rollBackCurrentLocation(args: {
    curr: DbLocationPointer;
    prev: DbLocationPointer;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
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

  private async getBlockCount(from?: number, to?: number): Promise<number> {
    if (from === undefined && to === undefined) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT COALESCE(SUM(inscription_count), 0) AS count
      FROM inscriptions_per_block
      WHERE TRUE
        ${from !== undefined ? this.sql`AND block_height >= ${from}` : this.sql``}
        ${to !== undefined ? this.sql`AND block_height <= ${to}` : this.sql``}
    `;
    return result[0].count;
  }

  private async getBlockHashCount(hash?: string): Promise<number> {
    if (!hash) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT COALESCE(SUM(inscription_count), 0) AS count
      FROM inscriptions_per_block
      WHERE block_hash = ${hash}
    `;
    return result[0].count;
  }

  private async getInscriptionCount(type?: DbInscriptionType): Promise<number> {
    const types =
      type !== undefined ? [type] : [DbInscriptionType.blessed, DbInscriptionType.cursed];
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

  private async getGenesisAddressCount(genesisAddress?: string[]): Promise<number> {
    if (!genesisAddress) return 0;
    const result = await this.sql<{ count: number }[]>`
      SELECT COALESCE(SUM(count), 0) AS count
      FROM counts_by_genesis_address
      WHERE address IN ${this.sql(genesisAddress)}
    `;
    return result[0].count;
  }
}

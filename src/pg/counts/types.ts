/** Type of row count required for an inscription index endpoint call */
export enum DbInscriptionIndexResultCountType {
  /** All inscriptions */
  all,
  /** Filtered by mime type */
  mimeType,
  /** Filtered by sat rarity */
  satRarity,
  /** Filtered by address */
  address,
  blockHeight,
  fromblockHeight,
  toblockHeight,
  blockHeightRange,
  /** Filtered by some param that yields a single result (easy to count) */
  singleResult,
  /** Filtered by custom arguments (very hard to count) */
  intractable,
}

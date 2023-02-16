const HALVING_BLOCKS = 210_000;
const DIFFICULTY_ADJUST_BLOCKS = 2016;
const INITIAL_SUBSIDY = 50;
const SATS_PER_BTC = 100_000_000;

export type OrdinalSatoshi = {
  block_height: number;
  cycle: number;
  decimal: string;
  degree: string;
  // name: string;
};

export function getOrdinalSatoshi(sat: number): OrdinalSatoshi {
  let satAccum = 0;
  let subsidy = INITIAL_SUBSIDY;
  let halvings = 0;
  while (true) {
    const satHalvingMax = HALVING_BLOCKS * subsidy * SATS_PER_BTC;
    if (satAccum + satHalvingMax > sat) {
      break;
    }
    satAccum += satHalvingMax;
    subsidy /= 2;
    halvings++;
  }

  const halvingOffset = sat - satAccum;
  const exactHeight = halvingOffset / (subsidy * SATS_PER_BTC) + halvings * HALVING_BLOCKS;
  const block_height = Math.floor(exactHeight);
  const cycle = Math.floor(halvings / 6);

  const hour = cycle;
  const minute = block_height % (halvings * HALVING_BLOCKS);
  const second = block_height % DIFFICULTY_ADJUST_BLOCKS;
  const third = Math.round((exactHeight - block_height) * subsidy * Math.pow(10, 8));
  const degree = `${hour}°${minute}′${second}″${third}‴`;
  const decimal = `${block_height}.${third}`;

  return {
    block_height,
    cycle,
    decimal,
    degree,
  };
}

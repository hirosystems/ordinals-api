import { BitcoinInscriptionRevealed } from '@hirosystems/chainhook-client';
import { Brc20 } from '../pg/helpers';

export function brc20Reveal(args: {
  json: Brc20;
  number: number;
  address: string;
  tx_id: string;
}): BitcoinInscriptionRevealed {
  const content = Buffer.from(JSON.stringify(args.json), 'utf-8');
  const reveal: BitcoinInscriptionRevealed = {
    content_bytes: `0x${content.toString('hex')}`,
    content_type: 'text/plain;charset=utf-8',
    content_length: content.length,
    inscription_number: args.number,
    inscription_fee: 2000,
    inscription_id: `${args.tx_id}i0`,
    inscription_output_value: 10000,
    inscriber_address: args.address,
    ordinal_number: 0,
    ordinal_block_height: 0,
    ordinal_offset: 0,
    satpoint_post_inscription: `${args.tx_id}:0:0`,
    inscription_input_index: 0,
    transfers_pre_inscription: 0,
    tx_index: 0,
  };
  return reveal;
}

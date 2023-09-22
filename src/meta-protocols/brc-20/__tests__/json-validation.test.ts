import { DbInscriptionInsert } from '../../../pg/types';
import { brc20FromInscription } from '../pg/helpers';

describe('BRC-20 json standard validation', () => {
  const testInsert = (json: any): DbInscriptionInsert => {
    const content = Buffer.from(JSON.stringify(json), 'utf-8');
    const insert: DbInscriptionInsert = {
      genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      number: 1,
      mime_type: 'application/json',
      content_type: 'application/json',
      content_length: content.length,
      content: `0x${content.toString('hex')}`,
      fee: '200',
      curse_type: null,
      sat_ordinal: '2000000',
      sat_rarity: 'common',
      sat_coinbase_height: 110,
      recursive: false,
    };
    return insert;
  };

  test('ignores incorrect MIME type', () => {
    const content = Buffer.from(
      JSON.stringify({
        p: 'brc-20',
        op: 'deploy',
        tick: 'PEPE',
        max: '21000000',
      }),
      'utf-8'
    );
    const insert: DbInscriptionInsert = {
      genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      number: 1,
      mime_type: 'foo/bar',
      content_type: 'foo/bar;x=1',
      content_length: content.length,
      content: `0x${content.toString('hex')}`,
      fee: '200',
      curse_type: null,
      sat_ordinal: '2000000',
      sat_rarity: 'common',
      sat_coinbase_height: 110,
      recursive: false,
    };
    expect(brc20FromInscription(insert)).toBeUndefined();
    insert.content_type = 'application/json';
    insert.mime_type = 'application/json';
    expect(brc20FromInscription(insert)).not.toBeUndefined();
    insert.content_type = 'text/plain;charset=utf-8';
    insert.mime_type = 'text/plain';
    expect(brc20FromInscription(insert)).not.toBeUndefined();
  });

  test('ignores invalid JSON', () => {
    const content = Buffer.from(
      '{"p": "brc-20", "op": "deploy", "tick": "PEPE", "max": "21000000"',
      'utf-8'
    );
    const insert: DbInscriptionInsert = {
      genesis_id: '38c46a8bf7ec90bc7f6b797e7dc84baa97f4e5fd4286b92fe1b50176d03b18dci0',
      number: 1,
      mime_type: 'application/json',
      content_type: 'application/json',
      content_length: content.length,
      content: `0x${content.toString('hex')}`,
      fee: '200',
      curse_type: null,
      sat_ordinal: '2000000',
      sat_rarity: 'common',
      sat_coinbase_height: 110,
      recursive: false,
    };
    expect(brc20FromInscription(insert)).toBeUndefined();
  });

  test('ignores incorrect p field', () => {
    const insert = testInsert({
      p: 'brc20', // incorrect
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
    });
    expect(brc20FromInscription(insert)).toBeUndefined();
  });

  test('ignores incorrect op field', () => {
    const insert = testInsert({
      p: 'brc-20',
      op: 'deploi', // incorrect
      tick: 'PEPE',
      max: '21000000',
    });
    expect(brc20FromInscription(insert)).toBeUndefined();
  });

  test('tick must be 4 bytes wide', () => {
    const insert = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPETESTER', // more than 4 bytes
      max: '21000000',
    });
    expect(brc20FromInscription(insert)).toBeUndefined();
    const insert2 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'Pe P', // valid
      max: '21000000',
    });
    expect(brc20FromInscription(insert2)).not.toBeUndefined();
    const insert3 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: '🤬😉', // more than 4 bytes
      max: '21000000',
    });
    expect(brc20FromInscription(insert3)).toBeUndefined();
    const insert4 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'X', // less than 4 bytes
      max: '21000000',
    });
    expect(brc20FromInscription(insert4)).toBeUndefined();
  });

  test('all fields must be strings', () => {
    const insert1 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: 21000000,
    });
    expect(brc20FromInscription(insert1)).toBeUndefined();
    const insert1a = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: 300,
    });
    expect(brc20FromInscription(insert1a)).toBeUndefined();
    const insert1b = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '300',
      dec: 2,
    });
    expect(brc20FromInscription(insert1b)).toBeUndefined();
    const insert2 = testInsert({
      p: 'brc-20',
      op: 'mint',
      tick: 'PEPE',
      amt: 2,
    });
    expect(brc20FromInscription(insert2)).toBeUndefined();
    const insert3 = testInsert({
      p: 'brc-20',
      op: 'transfer',
      tick: 'PEPE',
      amt: 2,
    });
    expect(brc20FromInscription(insert3)).toBeUndefined();
  });

  test('ignores empty strings', () => {
    const insert1 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: '',
      max: '21000000',
    });
    expect(brc20FromInscription(insert1)).toBeUndefined();
    const insert1a = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '',
    });
    expect(brc20FromInscription(insert1a)).toBeUndefined();
    const insert1b = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '',
    });
    expect(brc20FromInscription(insert1b)).toBeUndefined();
    const insert1c = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '200',
      dec: '',
    });
    expect(brc20FromInscription(insert1c)).toBeUndefined();
    const insert2 = testInsert({
      p: 'brc-20',
      op: 'mint',
      tick: '',
    });
    expect(brc20FromInscription(insert2)).toBeUndefined();
    const insert2a = testInsert({
      p: 'brc-20',
      op: 'mint',
      tick: 'PEPE',
      amt: '',
    });
    expect(brc20FromInscription(insert2a)).toBeUndefined();
    const insert3 = testInsert({
      p: 'brc-20',
      op: 'transfer',
      tick: '',
    });
    expect(brc20FromInscription(insert3)).toBeUndefined();
    const insert3a = testInsert({
      p: 'brc-20',
      op: 'transfer',
      tick: 'PEPE',
      amt: '',
    });
    expect(brc20FromInscription(insert3a)).toBeUndefined();
  });

  test('numeric strings must not be zero', () => {
    const insert1 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '0',
    });
    expect(brc20FromInscription(insert1)).toBeUndefined();
    const insert1b = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '0.0',
    });
    expect(brc20FromInscription(insert1b)).toBeUndefined();
    const insert1c = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '200',
      dec: '0',
    });
    // `dec` can have a value of 0
    expect(brc20FromInscription(insert1c)).not.toBeUndefined();
    const insert2a = testInsert({
      p: 'brc-20',
      op: 'mint',
      tick: 'PEPE',
      amt: '0',
    });
    expect(brc20FromInscription(insert2a)).toBeUndefined();
    const insert3a = testInsert({
      p: 'brc-20',
      op: 'transfer',
      tick: 'PEPE',
      amt: '.0000',
    });
    expect(brc20FromInscription(insert3a)).toBeUndefined();
  });

  test('numeric fields are not stripped/trimmed', () => {
    const insert1 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: ' 200  ',
    });
    expect(brc20FromInscription(insert1)).toBeUndefined();
    const insert1b = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '+10000',
    });
    expect(brc20FromInscription(insert1b)).toBeUndefined();
    const insert1c = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '200',
      dec: '   0 ',
    });
    expect(brc20FromInscription(insert1c)).toBeUndefined();
    const insert2a = testInsert({
      p: 'brc-20',
      op: 'mint',
      tick: 'PEPE',
      amt: '.05 ',
    });
    expect(brc20FromInscription(insert2a)).toBeUndefined();
    const insert3a = testInsert({
      p: 'brc-20',
      op: 'transfer',
      tick: 'PEPE',
      amt: '-25.00',
    });
    expect(brc20FromInscription(insert3a)).toBeUndefined();
  });

  test('max value of dec is 18', () => {
    const insert1c = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '200',
      dec: '20',
    });
    expect(brc20FromInscription(insert1c)).toBeUndefined();
  });

  test('max value of any numeric field is uint64_max', () => {
    const insert1 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '18446744073709551999',
    });
    expect(brc20FromInscription(insert1)).toBeUndefined();
    const insert1b = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '21000000',
      lim: '18446744073709551999',
    });
    expect(brc20FromInscription(insert1b)).toBeUndefined();
    const insert2a = testInsert({
      p: 'brc-20',
      op: 'mint',
      tick: 'PEPE',
      amt: '18446744073709551999',
    });
    expect(brc20FromInscription(insert2a)).toBeUndefined();
    const insert3a = testInsert({
      p: 'brc-20',
      op: 'transfer',
      tick: 'PEPE',
      amt: '18446744073709551999',
    });
    expect(brc20FromInscription(insert3a)).toBeUndefined();
  });

  test('valid JSONs can have additional properties', () => {
    const insert1 = testInsert({
      p: 'brc-20',
      op: 'deploy',
      tick: 'PEPE',
      max: '200',
      foo: 'bar',
      test: 1,
    });
    expect(brc20FromInscription(insert1)).not.toBeUndefined();
    const insert2a = testInsert({
      p: 'brc-20',
      op: 'mint',
      tick: 'PEPE',
      amt: '5',
      foo: 'bar',
      test: 1,
    });
    expect(brc20FromInscription(insert2a)).not.toBeUndefined();
    const insert3a = testInsert({
      p: 'brc-20',
      op: 'transfer',
      tick: 'PEPE',
      amt: '25',
      foo: 'bar',
      test: 1,
    });
    expect(brc20FromInscription(insert3a)).not.toBeUndefined();
  });
});

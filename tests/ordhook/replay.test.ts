import { runMigrations } from '@hirosystems/api-toolkit';
import { ChainhookEventObserver } from '@hirosystems/chainhook-client';
import { buildApiServer } from '../../src/api/init';
import { ENV } from '../../src/env';
import { startOrdhookServer } from '../../src/ordhook/server';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import { TestChainhookPayloadBuilder, TestFastifyServer } from '../helpers';

describe('Replay', () => {
  let db: PgStore;
  let server: ChainhookEventObserver;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    await runMigrations(MIGRATIONS_DIR, 'up');
    ENV.ORDHOOK_AUTO_PREDICATE_REGISTRATION = false;
    ENV.ORDHOOK_INGESTION_MODE = 'replay';
    db = await PgStore.connect({ skipMigrations: true });
    server = await startOrdhookServer({ db });
    fastify = await buildApiServer({ db });
  });

  test('shuts down when streaming on replay mode', async () => {
    const payload1 = new TestChainhookPayloadBuilder()
      .streamingBlocks(true)
      .apply()
      .block({
        height: 767430,
        hash: '0x163de66dc9c0949905bfe8e148bde04600223cf88d19f26fdbeba1d6e6fa0f88',
        timestamp: 1676913207,
      })
      .transaction({
        hash: '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8',
      })
      .inscriptionRevealed({
        content_bytes: '0x303030303030303030303030',
        content_type: 'text/plain;charset=utf-8',
        content_length: 12,
        inscription_number: { classic: 0, jubilee: 0 },
        inscription_fee: 3425,
        inscription_output_value: 10000,
        inscription_id: '0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8i0',
        inscriber_address: 'bc1p3cyx5e2hgh53w7kpxcvm8s4kkega9gv5wfw7c4qxsvxl0u8x834qf0u2td',
        ordinal_number: 125348773618236,
        ordinal_block_height: 566462,
        ordinal_offset: 0,
        satpoint_post_inscription:
          '0x0268dd9743c862d80ab02cb1d0228036cfe172522850eb96be60cfee14b31fb8:0:0',
        inscription_input_index: 0,
        transfers_pre_inscription: 0,
        tx_index: 0,
        curse_type: null,
        inscription_pointer: null,
        delegate: null,
        metaprotocol: null,
        metadata: null,
        parent: null,
      })
      .build();

    const mockExit = jest.spyOn(process, 'exit').mockImplementation();
    const response = await server['fastify'].inject({
      method: 'POST',
      url: `/payload`,
      headers: { authorization: `Bearer ${ENV.ORDHOOK_NODE_AUTH_TOKEN}` },
      payload: payload1,
    });
    expect(response.statusCode).toBe(200);
    expect(mockExit).toHaveBeenCalled();
    mockExit.mockRestore();
  });

  afterEach(async () => {
    await server.close();
    await fastify.close();
    await db.close();
    await runMigrations(MIGRATIONS_DIR, 'down');
  });
});

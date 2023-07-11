import { buildApiServer } from '../src/api/init';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { TestFastifyServer, randomHash, testRevealApply } from './helpers';

describe('recursion routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await buildApiServer({ db });
    await cycleMigrations();
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  describe('/blockheight', () => {
    test('returns default `blockheight` when no blocks found', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blockheight',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('767430');
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );
    });

    test('returns latest block height', async () => {
      await db.updateInscriptions(testRevealApply(778_001));

      let response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blockheight',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('778001');
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );

      await db.updateInscriptions(testRevealApply(778_002));

      response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blockheight',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('778002');
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );
    });
  });

  describe('/blockhash', () => {
    test('returns default `blockhash` when no blocks found', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blockhash',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('blockhash');
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );
    });

    test('returns latest block hash', async () => {
      let blockHash = randomHash();
      await db.updateInscriptions(testRevealApply(778_001, { blockHash }));

      let response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blockhash',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(blockHash);
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );

      blockHash = randomHash();
      await db.updateInscriptions(testRevealApply(778_002, { blockHash }));

      response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blockhash',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(blockHash);
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );
    });

    test('returns block hash by block height', async () => {
      const blockHash = randomHash();
      await db.updateInscriptions(testRevealApply(778_001));
      await db.updateInscriptions(testRevealApply(778_002, { blockHash }));
      await db.updateInscriptions(testRevealApply(778_003));

      const response = await fastify.inject({
        method: 'GET',
        url: `/ordinals/v1/blockhash/778002`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(blockHash);
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );
    });
  });

  describe('/blocktime', () => {
    test('returns default `blocktime` when no blocks found', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blocktime',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('blocktime');
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );
    });

    test('returns latest block timestamp', async () => {
      let timestamp = Date.now();
      await db.updateInscriptions(testRevealApply(778_001, { timestamp }));

      let response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blocktime',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(timestamp.toString());
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );

      timestamp = Date.now();
      await db.updateInscriptions(testRevealApply(778_002, { timestamp }));

      response = await fastify.inject({
        method: 'GET',
        url: '/ordinals/v1/blocktime',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(timestamp.toString());
      expect(response.headers).toEqual(
        expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' })
      );
    });
  });
});

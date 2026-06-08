import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgVectorClientWrapper } from './pgvector-client.js';

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();
const mockEnd = vi.fn().mockResolvedValue(undefined);

const mockClient = { query: mockQuery, release: mockRelease };

mockConnect.mockResolvedValue(mockClient);

vi.mock('pg', () => {
  class MockPool {
    connect = mockConnect;
    query = mockQuery;
    end = mockEnd;
  }
  return { default: { Pool: MockPool }, Pool: MockPool };
});

const validConfig = {
  connectionString: 'postgres://localhost/test',
  tableName: 'test_table',
  vectorDimension: 1536,
};

describe('PgVectorClientWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should have provider as pgvector', () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      expect(adapter.provider).toBe('pgvector');
    });

    it('should expose correct capabilities', () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      expect(adapter.capabilities.supportsHybridSearch).toBe(false);
      expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(true);
      expect(adapter.capabilities.supportsMultiTenancy).toBe(true);
      expect(adapter.capabilities.supportsQuantization).toBe(false);
      expect(adapter.capabilities.supportsScan).toBe(true);
      expect(adapter.capabilities.maxBatchSize).toBe(1000);
      expect(adapter.capabilities.maxVectorDimension).toBe(16000);
    });

    it('should expose cost model with zero values', () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      expect(adapter.costModel.costPerQueryEstimate).toBe(0);
      expect(adapter.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should create pool and run setup queries', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      await adapter.initialize();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith('CREATE EXTENSION IF NOT EXISTS vector');
      expect(mockQuery).toHaveBeenCalledWith('SET search_path TO "public"');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS "public"."test_table"'),
      );
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent when called multiple times', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.initialize();

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should use custom schema when provided', async () => {
      const adapter = new PgVectorClientWrapper({
        ...validConfig,
        schema: 'custom_schema',
      });
      await adapter.initialize();

      expect(mockQuery).toHaveBeenCalledWith('SET search_path TO "custom_schema"');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('"custom_schema"."test_table"'),
      );
    });

    it('should create table with correct vector dimension', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      await adapter.initialize();

      const createTableCall = mockQuery.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('CREATE TABLE'),
      );
      expect(createTableCall).toBeDefined();
      expect(createTableCall![0] as string).toContain('vector(1536)');
    });
  });

  describe('ensureInitialized', () => {
    it('should throw when accessing methods before initialization', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      await expect(adapter.search({ vector: [0.1], topK: 5 })).rejects.toThrow('not initialized');
      await expect(adapter.upsertBatch([])).rejects.toThrow('not initialized');
      await expect(adapter.deleteCollection('test')).rejects.toThrow('not initialized');
      await expect(adapter.scanPoints('test')).rejects.toThrow('not initialized');
    });
  });

  describe('search', () => {
    it('should build correct SQL and map results', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({
        rows: [
          { id: 'chunk-1', score: '0.85', payload: { documentId: 'doc-1', content: 'hello' } },
        ],
      });

      const results = await adapter.search({ vector: [0.1, 0.2, 0.3], topK: 5 });

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('SELECT id, 1 - (vector <=> $1::vector) AS score, payload');
      expect(callArgs[0]).toContain('FROM "public"."test_table"');
      expect(callArgs[0]).toContain('ORDER BY vector <=> $1::vector');
      expect(callArgs[0]).toContain('LIMIT $2');
      expect(callArgs[1][0]).toBe('[0.1,0.2,0.3]');
      expect(callArgs[1][1]).toBe(5);

      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe('chunk-1');
      expect(results[0].documentId).toBe('doc-1');
      expect(results[0].content).toBe('hello');
      expect(results[0].score).toBe(0.85);
      expect(results[0].source).toBe('vector');
      expect(results[0].metadata).toEqual({ documentId: 'doc-1', content: 'hello' });
    });

    it('should handle empty results', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results).toHaveLength(0);
    });

    it('should handle filter with $eq operator', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $eq: 'active' } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(sql).toContain("payload->>'status' = $3");
      expect(params[2]).toBe('active');
    });

    it('should handle filter with $ne operator', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $ne: 'inactive' } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("payload->>'status' != $3");
    });

    it('should handle filter with $in operator', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $in: ['active', 'pending'] } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(sql).toContain("payload->>'status' IN ($3,$4)");
      expect(params[2]).toBe('active');
      expect(params[3]).toBe('pending');
    });

    it('should handle filter with $nin operator', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $nin: ['deleted', 'archived'] } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(sql).toContain("payload->>'status' NOT IN ($3,$4)");
      expect(params[2]).toBe('deleted');
      expect(params[3]).toBe('archived');
    });

    it('should handle filter with $gt operator', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { price: { $gt: 100 } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(sql).toContain("(payload->'price')::numeric > $3");
      expect(params[2]).toBe(100);
    });

    it('should handle filter with $gte operator', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { price: { $gte: 50 } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("(payload->'price')::numeric >= $3");
    });

    it('should handle filter with $lt operator', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { price: { $lt: 200 } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("(payload->'price')::numeric < $3");
    });

    it('should handle filter with $lte operator', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { price: { $lte: 199 } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("(payload->'price')::numeric <= $3");
    });

    it('should handle filter with $exists true', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { email: { $exists: true } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("payload->'email' IS NOT NULL");
    });

    it('should handle filter with $exists false', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { email: { $exists: false } },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("payload->'email' IS NULL");
    });

    it('should handle $and logical filter', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: {
          $and: [{ status: { $eq: 'active' } }, { age: { $gte: 18 } }],
        },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(sql).toContain('AND (');
      expect(sql).toContain('AND');
      expect(params).toContain('active');
      expect(params).toContain(18);
    });

    it('should handle $or logical filter', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: {
          $or: [{ role: { $eq: 'admin' } }, { role: { $eq: 'moderator' } }],
        },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(sql).toContain('AND (');
      expect(sql).toContain('OR');
      expect(params).toContain('admin');
      expect(params).toContain('moderator');
    });

    it('should handle null value filter', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { deleted_at: null },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("payload->'deleted_at' IS NULL");
    });

    it('should handle direct value filter (shorthand)', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { department: 'engineering' },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(sql).toContain("payload->>'department' = $3");
      expect(params[2]).toBe('engineering');
    });

    it('should have no WHERE clause when no filter provided', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({ vector: [0.1], topK: 5 });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('AND');
    });

    it('should handle missing payload fields gracefully', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'chunk-1', score: '0.5', payload: {} }],
      });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results[0].documentId).toBe('');
      expect(results[0].content).toBe('');
      expect(results[0].metadata).toEqual({});
    });
  });

  describe('upsertPoint', () => {
    it('should insert a single point via transaction', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery, connect: mockConnect };

      await adapter.upsertPoint({
        id: 'point-1',
        vector: [0.1, 0.2],
        payload: { content: 'doc' },
      });

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO'), [
        'point-1',
        '[0.1,0.2]',
        JSON.stringify({ content: 'doc' }),
      ]);
      expect(mockQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('upsertBatch', () => {
    it('should execute transaction with BEGIN/COMMIT and INSERT statements', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery, connect: mockConnect };

      await adapter.upsertBatch([
        { id: 'p1', vector: [0.1, 0.2], payload: { content: 'doc1' } },
        { id: 'p2', vector: [0.3, 0.4], payload: { content: 'doc2' } },
      ]);

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['p1']),
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['p2']),
      );
      expect(mockQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('should rollback on error', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery, connect: mockConnect };

      mockQuery.mockResolvedValueOnce(undefined);
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        adapter.upsertBatch([{ id: 'p1', vector: [0.1], payload: { content: 'doc1' } }]),
      ).rejects.toThrow('DB error');

      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteCollection', () => {
    it('should drop table', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      await adapter.deleteCollection('old_table');

      expect(mockQuery).toHaveBeenCalledWith('DROP TABLE IF EXISTS "public"."old_table"');
    });
  });

  describe('getCollectionInfo', () => {
    it('should return collection stats', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [{ count: 42 }] });

      const stats = await adapter.getCollectionInfo('docs');

      expect(stats).toEqual({
        collectionName: 'docs',
        vectorCount: 42,
        vectorDimension: 1536,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT count(*)::int AS count'),
      );
    });

    it('should return null on query error', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockRejectedValue(new Error('table not found'));

      const stats = await adapter.getCollectionInfo('missing');
      expect(stats).toBeNull();
    });

    it('should handle missing count in result', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [{}] });

      const stats = await adapter.getCollectionInfo('docs');
      expect(stats?.vectorCount).toBe(0);
    });
  });

  describe('listCollections', () => {
    it('should return list of table names', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({
        rows: [{ table_name: 'docs' }, { table_name: 'chunks' }],
      });

      const tables = await adapter.listCollections();

      expect(tables).toEqual(['docs', 'chunks']);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT table_name FROM information_schema.tables'),
        ['public'],
      );
    });

    it('should return empty array on error', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockRejectedValue(new Error('connection error'));

      const tables = await adapter.listCollections();
      expect(tables).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true when query succeeds', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false when query fails', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockRejectedValue(new Error('connection refused'));

      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should end the pool', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery, end: mockEnd };

      await adapter.close();

      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanPoints', () => {
    it('should return points with nextCursor', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({
        rows: [
          { id: '1', vector: '[0.1,0.2]', payload: { content: 'doc1' } },
          { id: '2', vector: '[0.3,0.4]', payload: { content: 'doc2' } },
        ],
      });

      const result = await adapter.scanPoints('test_table');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, vector::text, payload'),
        [100, 0],
      );
      expect(result.points).toHaveLength(2);
      expect(result.points[0].id).toBe('1');
      expect(result.points[0].vector).toEqual([0.1, 0.2]);
      expect(result.points[0].payload).toEqual({ content: 'doc1' });
      expect(result.nextCursor).toBeUndefined();
    });

    it('should return points without nextCursor when fewer results than limit', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({
        rows: [{ id: '1', vector: '[0.1]', payload: {} }],
      });

      const result = await adapter.scanPoints('test_table', { batchSize: 100 });
      expect(result.nextCursor).toBeUndefined();
    });

    it('should return nextCursor when results equal limit', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      const manyRows = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        vector: '[0.1]',
        payload: {},
      }));
      mockQuery.mockResolvedValue({ rows: manyRows });

      const result = await adapter.scanPoints('test_table', { batchSize: 50 });
      expect(result.nextCursor).toBe('50');
    });

    it('should handle custom batchSize and cursor', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.scanPoints('test_table', { batchSize: 10, cursor: '20' });

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [10, 20]);
    });
  });

  describe('parseVector', () => {
    it('should parse bracket string format', () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      const result = (adapter as any).parseVector('[0.1,0.2,0.3]');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should handle array input', () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      const result = (adapter as any).parseVector([0.5, 0.6]);
      expect(result).toEqual([0.5, 0.6]);
    });

    it('should return empty array for invalid input', () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      const result = (adapter as any).parseVector(42);
      expect(result).toEqual([]);
    });
  });

  describe('quoteIdentifier', () => {
    it('should throw for invalid identifiers via deleteCollection', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      await expect(adapter.deleteCollection('bad-table-name')).rejects.toThrow(
        'Invalid SQL identifier',
      );
    });

    it('should accept valid identifiers via deleteCollection', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      await adapter.deleteCollection('valid_table');
      expect(mockQuery).toHaveBeenCalledWith('DROP TABLE IF EXISTS "public"."valid_table"');
    });
  });

  describe('buildWhereClause', () => {
    it('should handle logical $and with no valid clauses', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { $and: [] },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('AND (');
    });

    it('should handle logical $or with no valid clauses', async () => {
      const adapter = new PgVectorClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).pool = { query: mockQuery };

      mockQuery.mockResolvedValue({ rows: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { $or: [] },
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('AND (');
    });
  });
});

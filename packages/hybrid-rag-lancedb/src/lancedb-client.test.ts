import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanceDBClientWrapper } from './lancedb-client.js';

const mockDb = vi.hoisted(() => ({
  tableNames: vi.fn(),
  openTable: vi.fn(),
  createTable: vi.fn(),
  dropTable: vi.fn(),
  close: vi.fn(),
}));

const mockTable = vi.hoisted(() => ({
  vectorSearch: vi.fn(),
  add: vi.fn(),
  countRows: vi.fn(),
  query: vi.fn(),
}));

const mockSearchQuery = vi.hoisted(() => ({
  limit: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  toArray: vi.fn(),
}));

const mockScanQuery = vi.hoisted(() => ({
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  toArray: vi.fn(),
}));

vi.mock('@lancedb/lancedb', () => ({
  connect: vi.fn().mockResolvedValue(mockDb),
}));

describe('LanceDBClientWrapper', () => {
  const validConfig = {
    uri: '.lancedb-test',
    tableName: 'test_table',
    vectorDimension: 1536,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTable.vectorSearch.mockReturnValue(mockSearchQuery);
    mockTable.query.mockReturnValue(mockScanQuery);
    mockDb.tableNames.mockResolvedValue(['test_table']);
    mockDb.openTable.mockResolvedValue(mockTable);
    mockDb.createTable.mockResolvedValue(mockTable);
  });

  describe('constructor', () => {
    it('should accept a valid config and expose provider', () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      expect(adapter.provider).toBe('lancedb');
    });

    it('should expose correct capabilities', () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      expect(adapter.capabilities.supportsHybridSearch).toBe(false);
      expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(true);
      expect(adapter.capabilities.supportsMultiTenancy).toBe(false);
      expect(adapter.capabilities.supportsQuantization).toBe(true);
      expect(adapter.capabilities.supportsScan).toBe(true);
      expect(adapter.capabilities.maxBatchSize).toBe(1000);
      expect(adapter.capabilities.maxVectorDimension).toBe(32768);
    });

    it('should expose cost model', () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      expect(adapter.costModel.costPerQueryEstimate).toBe(0);
      expect(adapter.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should connect and open existing table', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      expect(mockDb.tableNames).toHaveBeenCalled();
      expect(mockDb.openTable).toHaveBeenCalledWith('test_table');
      expect(mockDb.createTable).not.toHaveBeenCalled();
    });

    it('should create table if it does not exist', async () => {
      mockDb.tableNames.mockResolvedValue([]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      expect(mockDb.createTable).toHaveBeenCalledWith({
        name: 'test_table',
        data: [],
      });
      expect(mockDb.openTable).not.toHaveBeenCalled();
    });

    it('should return immediately if already initialized', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      mockDb.tableNames.mockClear();
      await adapter.initialize();
      expect(mockDb.tableNames).not.toHaveBeenCalled();
    });

    it('should return initPromise on concurrent calls', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      const p1 = adapter.initialize();
      const p2 = adapter.initialize();
      await Promise.all([p1, p2]);
      expect(mockDb.tableNames).toHaveBeenCalledTimes(1);
    });
  });

  describe('search', () => {
    const vector = [0.1, 0.2, 0.3];

    it('should perform vector search and map results', async () => {
      mockSearchQuery.toArray.mockResolvedValue([
        { id: 'id1', _distance: 0.05, payload: { documentId: 'doc1', content: 'hello' } },
        { id: 'id2', _distance: 0.15, payload: { documentId: 'doc2', content: 'world' } },
      ]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 10 });
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        chunkId: 'id1',
        documentId: 'doc1',
        content: 'hello',
        score: 0.95,
        source: 'vector',
        metadata: { documentId: 'doc1', content: 'hello' },
      });
      expect(results[1].score).toBe(0.85);
      expect(mockTable.vectorSearch).toHaveBeenCalledWith(vector);
      expect(mockSearchQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should apply filter when provided', async () => {
      mockSearchQuery.toArray.mockResolvedValue([]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({
        vector,
        topK: 5,
        filter: { status: { $eq: 'active' } },
      });
      expect(mockSearchQuery.where).toHaveBeenCalledWith("payload.status = 'active'");
    });

    it('should not call where when no filter', async () => {
      mockSearchQuery.toArray.mockResolvedValue([]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({ vector, topK: 5 });
      expect(mockSearchQuery.where).not.toHaveBeenCalled();
    });

    it('should handle missing _distance', async () => {
      mockSearchQuery.toArray.mockResolvedValue([
        { id: 'id1', payload: { documentId: 'doc1', content: 'test' } },
      ]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 5 });
      expect(results[0].score).toBe(0);
    });

    it('should handle empty results', async () => {
      mockSearchQuery.toArray.mockResolvedValue([]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 5 });
      expect(results).toEqual([]);
    });

    it('should handle search result with null row.id', async () => {
      mockSearchQuery.toArray.mockResolvedValue([
        { payload: { documentId: 'doc1', content: 'test' } },
      ]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 5 });
      expect(results[0].chunkId).toBe('');
    });

    it('should handle search result with null payload', async () => {
      mockSearchQuery.toArray.mockResolvedValue([{ id: 'id1', _distance: 0.1 }]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 5 });
      expect(results[0].documentId).toBe('');
      expect(results[0].content).toBe('');
      expect(results[0].metadata).toEqual({});
    });

    it('should handle search result with payload missing documentId and content', async () => {
      mockSearchQuery.toArray.mockResolvedValue([
        { id: 'id1', payload: { other: 'field' }, _distance: 0.1 },
      ]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 5 });
      expect(results[0].documentId).toBe('');
      expect(results[0].content).toBe('');
    });

    it('should throw if not initialized', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await expect(adapter.search({ vector, topK: 5 })).rejects.toThrow('not initialized');
    });
  });

  describe('upsertPoint', () => {
    it('should add a point to the table', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const point = { id: 'p1', vector: [1, 2, 3], payload: { doc: 'test' } };
      await adapter.upsertPoint(point);
      expect(mockTable.add).toHaveBeenCalledTimes(1);
      const records = mockTable.add.mock.calls[0][0];
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('p1');
      expect(records[0].vector).toBeInstanceOf(Float32Array);
      expect(Array.from(records[0].vector)).toEqual([1, 2, 3]);
      expect(records[0].payload).toEqual({ doc: 'test' });
    });
  });

  describe('upsertBatch', () => {
    it('should add multiple points', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const points = [
        { id: 'p1', vector: [1, 2], payload: { a: 1 } },
        { id: 'p2', vector: [3, 4], payload: { b: 2 } },
      ];
      await adapter.upsertBatch(points);
      expect(mockTable.add).toHaveBeenCalledTimes(1);
      const records = mockTable.add.mock.calls[0][0];
      expect(records).toHaveLength(2);
      expect(records[0].vector).toBeInstanceOf(Float32Array);
      expect(records[1].vector).toBeInstanceOf(Float32Array);
    });

    it('should batch points exceeding maxBatchSize', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const points = Array.from({ length: 2500 }, (_, i) => ({
        id: `p${i}`,
        vector: [i],
        payload: {},
      }));
      await adapter.upsertBatch(points);
      expect(mockTable.add).toHaveBeenCalledTimes(3);
    });

    it('should throw if not initialized', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await expect(adapter.upsertBatch([{ id: '1', vector: [1], payload: {} }])).rejects.toThrow(
        'not initialized',
      );
    });
  });

  describe('deleteCollection', () => {
    it('should drop table', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.deleteCollection('my_table');
      expect(mockDb.dropTable).toHaveBeenCalledWith('my_table');
    });

    it('should throw if not initialized', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await expect(adapter.deleteCollection('x')).rejects.toThrow('not initialized');
    });
  });

  describe('getCollectionInfo', () => {
    it('should return stats', async () => {
      mockTable.countRows.mockResolvedValue(42);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('test_table');
      expect(info).toEqual({
        collectionName: 'test_table',
        vectorCount: 42,
        vectorDimension: 1536,
      });
      expect(mockDb.openTable).toHaveBeenCalledWith('test_table');
    });

    it('should return null on error', async () => {
      mockDb.openTable.mockReset();
      mockDb.openTable.mockResolvedValueOnce(mockTable);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      mockDb.openTable.mockRejectedValueOnce(new Error('missing'));
      const info = await adapter.getCollectionInfo('bad');
      expect(info).toBeNull();
    });
  });

  describe('listCollections', () => {
    it('should return table names', async () => {
      mockDb.tableNames.mockResolvedValue(['t1', 't2']);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const names = await adapter.listCollections();
      expect(names).toEqual(['t1', 't2']);
    });

    it('should return empty array on error', async () => {
      mockDb.tableNames.mockRejectedValue(new Error('fail'));
      const adapter = new LanceDBClientWrapper(validConfig);
      const names = await adapter.listCollections();
      expect(names).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true when db responds', async () => {
      mockDb.tableNames.mockResolvedValue([]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when db throws', async () => {
      mockDb.tableNames.mockRejectedValue(new Error('down'));
      const adapter = new LanceDBClientWrapper(validConfig);
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should close the connection', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.close();
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should handle close without initialization', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('scanPoints', () => {
    it('should return points from default table', async () => {
      mockScanQuery.toArray.mockResolvedValue([
        { id: 'p1', vector: new Float32Array([1, 2, 3]), payload: { key: 'val' } },
      ]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('');
      expect(result.points).toHaveLength(1);
      expect(result.points[0]).toEqual({ id: 'p1', vector: [1, 2, 3], payload: { key: 'val' } });
    });

    it('should open collection when name provided', async () => {
      mockScanQuery.toArray.mockResolvedValue([]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.scanPoints('other_table');
      expect(mockDb.openTable).toHaveBeenCalledWith('other_table');
    });

    it('should use cursor as offset', async () => {
      mockScanQuery.toArray.mockResolvedValue([]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.scanPoints('', { batchSize: 50, cursor: '100' });
      expect(mockScanQuery.limit).toHaveBeenCalledWith(50);
      expect(mockScanQuery.offset).toHaveBeenCalledWith(100);
    });

    it('should return nextCursor when more results available', async () => {
      mockScanQuery.toArray.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) => ({
          id: `p${i}`,
          vector: new Float32Array([i]),
          payload: {},
        })),
      );
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('', { batchSize: 100 });
      expect(result.nextCursor).toBe('100');
    });

    it('should not return nextCursor when fewer results than limit', async () => {
      mockScanQuery.toArray.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
          id: `p${i}`,
          vector: new Float32Array([i]),
          payload: {},
        })),
      );
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('', { batchSize: 100 });
      expect(result.nextCursor).toBeUndefined();
    });

    it('should handle empty vector field', async () => {
      mockScanQuery.toArray.mockResolvedValue([
        { id: 'p1', vector: new Float32Array([]), payload: { key: 'val' } },
      ]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('');
      expect(result.points[0].vector).toEqual([]);
    });

    it('should handle scan result with null id and payload', async () => {
      mockScanQuery.toArray.mockResolvedValue([{ vector: new Float32Array([1, 2]) }]);
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('');
      expect(result.points[0].id).toBe('');
      expect(result.points[0].payload).toEqual({});
    });

    it('should throw if not initialized', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await expect(adapter.scanPoints('x')).rejects.toThrow('not initialized');
    });
  });

  describe('ensureInitialized', () => {
    it('should throw when calling methods before init', async () => {
      const adapter = new LanceDBClientWrapper(validConfig);
      await expect(adapter.search({ vector: [1], topK: 5 })).rejects.toThrow('not initialized');
      await expect(adapter.upsertBatch([])).rejects.toThrow('not initialized');
      await expect(adapter.deleteCollection('x')).rejects.toThrow('not initialized');
      await expect(adapter.scanPoints('x')).rejects.toThrow('not initialized');
    });
  });

  describe('buildLanceFilter - filter building', () => {
    const vector = [0.1, 0.2, 0.3];

    beforeEach(() => {
      mockSearchQuery.toArray.mockResolvedValue([]);
    });

    async function getWhere(filter: unknown): Promise<string | undefined> {
      const adapter = new LanceDBClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({ vector, topK: 5, filter: filter as any });
      if (mockSearchQuery.where.mock.calls.length === 0) return undefined;
      return mockSearchQuery.where.mock.calls[0][0] as string;
    }

    it('should handle $and filter', async () => {
      const where = await getWhere({ $and: [{ status: 'active' }, { age: { $gt: 18 } }] });
      expect(where).toBe("payload.status = 'active' AND payload.age > 18");
    });

    it('should handle $or filter', async () => {
      const where = await getWhere({ $or: [{ role: 'admin' }, { role: 'mod' }] });
      expect(where).toBe("(payload.role = 'admin' OR payload.role = 'mod')");
    });

    it('should handle $eq operator', async () => {
      const where = await getWhere({ field: { $eq: 'value' } });
      expect(where).toBe("payload.field = 'value'");
    });

    it('should handle $eq with null value', async () => {
      const where = await getWhere({ field: { $eq: null } });
      expect(where).toBe('payload.field = NULL');
    });

    it('should handle $ne operator', async () => {
      const where = await getWhere({ field: { $ne: 'value' } });
      expect(where).toBe("payload.field != 'value'");
    });

    it('should handle $in operator', async () => {
      const where = await getWhere({ field: { $in: ['a', 'b', 'c'] } });
      expect(where).toBe("payload.field IN ('a','b','c')");
    });

    it('should handle $nin operator', async () => {
      const where = await getWhere({ field: { $nin: ['x', 'y'] } });
      expect(where).toBe("payload.field NOT IN ('x','y')");
    });

    it('should handle $exists true', async () => {
      const where = await getWhere({ field: { $exists: true } });
      expect(where).toBe('payload.field IS NOT NULL');
    });

    it('should handle $exists false', async () => {
      const where = await getWhere({ field: { $exists: false } });
      expect(where).toBe('payload.field IS NULL');
    });

    it('should handle $gt operator', async () => {
      const where = await getWhere({ age: { $gt: 21 } });
      expect(where).toBe('payload.age > 21');
    });

    it('should handle $gte operator', async () => {
      const where = await getWhere({ age: { $gte: 18 } });
      expect(where).toBe('payload.age >= 18');
    });

    it('should handle $lt operator', async () => {
      const where = await getWhere({ age: { $lt: 65 } });
      expect(where).toBe('payload.age < 65');
    });

    it('should handle $lte operator', async () => {
      const where = await getWhere({ age: { $lte: 18 } });
      expect(where).toBe('payload.age <= 18');
    });

    it('should handle null value', async () => {
      const where = await getWhere({ deleted: null });
      expect(where).toBe('payload.deleted IS NULL');
    });

    it('should handle undefined value', async () => {
      const where = await getWhere({ deleted: undefined });
      expect(where).toBe('payload.deleted IS NULL');
    });

    it('should handle plain value', async () => {
      const where = await getWhere({ status: 'active' });
      expect(where).toBe("payload.status = 'active'");
    });

    it('should handle numeric plain value', async () => {
      const where = await getWhere({ count: 42 });
      expect(where).toBe('payload.count = 42');
    });

    it('should escape single quotes in values', async () => {
      const where = await getWhere({ name: "O'Brien" });
      expect(where).toBe("payload.name = 'O''Brien'");
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilvusClientWrapper } from './milvus-client.js';

const mockClient = vi.hoisted(() => ({
  useDatabase: vi.fn().mockResolvedValue(undefined),
  hasCollection: vi.fn(),
  createCollection: vi.fn().mockResolvedValue(undefined),
  createIndex: vi.fn().mockResolvedValue(undefined),
  loadCollection: vi.fn().mockResolvedValue(undefined),
  search: vi.fn(),
  insert: vi.fn().mockResolvedValue(undefined),
  dropCollection: vi.fn().mockResolvedValue(undefined),
  getCollectionStatistics: vi.fn(),
  listCollections: vi.fn(),
  closeConnection: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@zilliz/milvus2-sdk-node', () => ({
  MilvusClient: vi.fn(function () {
    return mockClient;
  }),
}));

describe('MilvusClientWrapper', () => {
  const validConfig = {
    address: 'localhost:19530',
    collectionName: 'test_coll',
    vectorDimension: 1536,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should accept a valid config and expose provider', () => {
      const adapter = new MilvusClientWrapper(validConfig);
      expect(adapter.provider).toBe('milvus');
    });

    it('should expose correct capabilities', () => {
      const adapter = new MilvusClientWrapper(validConfig);
      expect(adapter.capabilities.supportsHybridSearch).toBe(false);
      expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(true);
      expect(adapter.capabilities.supportsMultiTenancy).toBe(true);
      expect(adapter.capabilities.supportsQuantization).toBe(true);
      expect(adapter.capabilities.supportsScan).toBe(true);
      expect(adapter.capabilities.maxBatchSize).toBe(1000);
      expect(adapter.capabilities.maxVectorDimension).toBe(32768);
    });

    it('should expose cost model', () => {
      const adapter = new MilvusClientWrapper(validConfig);
      expect(adapter.costModel.costPerQueryEstimate).toBe(0);
      expect(adapter.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should create MilvusClient and skip collection creation if exists', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      expect(mockClient.hasCollection).toHaveBeenCalledWith({ collection_name: 'test_coll' });
      expect(mockClient.createCollection).not.toHaveBeenCalled();
      expect(mockClient.createIndex).not.toHaveBeenCalled();
      expect(mockClient.loadCollection).not.toHaveBeenCalled();
    });

    it('should create collection if not exists', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: false });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      expect(mockClient.createCollection).toHaveBeenCalledWith({
        collection_name: 'test_coll',
        fields: [
          { name: 'id', data_type: 'VarChar', is_primary_key: true, max_length: 512 },
          { name: 'vector', data_type: 'FloatVector', dim: 1536 },
          { name: 'payload', data_type: 'JSON' },
        ],
      });
      expect(mockClient.createIndex).toHaveBeenCalledWith({
        collection_name: 'test_coll',
        field_name: 'vector',
        index_type: 'IVF_FLAT',
        metric_type: 'IP',
      });
      expect(mockClient.loadCollection).toHaveBeenCalledWith({ collection_name: 'test_coll' });
    });

    it('should use database if configured', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper({ ...validConfig, database: 'my_db' });
      await adapter.initialize();
      expect(mockClient.useDatabase).toHaveBeenCalledWith({ db_name: 'my_db' });
    });

    it('should skip database call if not configured', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      expect(mockClient.useDatabase).not.toHaveBeenCalled();
    });

    it('should return immediately if already initialized', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      mockClient.hasCollection.mockClear();
      await adapter.initialize();
      expect(mockClient.hasCollection).not.toHaveBeenCalled();
    });

    it('should return initPromise on concurrent calls', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      const p1 = adapter.initialize();
      const p2 = adapter.initialize();
      await Promise.all([p1, p2]);
      expect(mockClient.hasCollection).toHaveBeenCalledTimes(1);
    });
  });

  describe('search', () => {
    const vector = [0.1, 0.2, 0.3];

    it('should perform vector search and map results', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.search.mockResolvedValue({
        results: [
          { id: 'id1', score: 0.95, payload: { documentId: 'doc1', content: 'hello' } },
          { id: 'id2', score: 0.85, payload: { documentId: 'doc2', content: 'world' } },
        ],
      });
      const adapter = new MilvusClientWrapper(validConfig);
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
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          collection_name: 'test_coll',
          vector,
          limit: 10,
          output_fields: ['id', 'payload'],
          metric_type: 'IP',
          params: { nprobe: 10 },
        }),
      );
    });

    it('should handle empty results', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.search.mockResolvedValue({ results: [] });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 5 });
      expect(results).toEqual([]);
    });

    it('should handle missing results field', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.search.mockResolvedValue({});
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 5 });
      expect(results).toEqual([]);
    });

    it('should pass filter expression when filter provided', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.search.mockResolvedValue({ results: [] });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({
        vector,
        topK: 10,
        filter: { status: { $eq: 'active' } },
      });
      expect(mockClient.search.mock.calls[0][0].expr).toBe("payload['status'] == 'active'");
    });

    it('should handle hit without payload or score', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.search.mockResolvedValue({
        results: [{ id: 'id1', score: null }],
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector, topK: 5 });
      expect(results[0].documentId).toBe('');
      expect(results[0].content).toBe('');
      expect(results[0].score).toBe(0);
    });

    it('should throw if not initialized', async () => {
      const adapter = new MilvusClientWrapper(validConfig);
      await expect(adapter.search({ vector, topK: 5 })).rejects.toThrow('not initialized');
    });
  });

  describe('upsertPoint', () => {
    it('should delegate to upsertBatch', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const point = { id: 'p1', vector: [0.1, 0.2], payload: { doc: 'test' } };
      await adapter.upsertPoint(point);
      expect(mockClient.insert).toHaveBeenCalledWith({
        collection_name: 'test_coll',
        fields_data: [
          {
            id: 'p1',
            vector: [0.1, 0.2],
            payload: JSON.stringify({ doc: 'test' }),
          },
        ],
      });
    });
  });

  describe('upsertBatch', () => {
    it('should insert points in correct format', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const points = [
        { id: 'p1', vector: [1, 2], payload: { a: 1 } },
        { id: 'p2', vector: [3, 4], payload: { b: 2 } },
      ];
      await adapter.upsertBatch(points);
      expect(mockClient.insert).toHaveBeenCalledWith({
        collection_name: 'test_coll',
        fields_data: [
          { id: 'p1', vector: [1, 2], payload: JSON.stringify({ a: 1 }) },
          { id: 'p2', vector: [3, 4], payload: JSON.stringify({ b: 2 }) },
        ],
      });
    });

    it('should batch points exceeding maxBatchSize', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const points = Array.from({ length: 2500 }, (_, i) => ({
        id: `p${i}`,
        vector: [i],
        payload: {},
      }));
      await adapter.upsertBatch(points);
      expect(mockClient.insert).toHaveBeenCalledTimes(3);
    });

    it('should throw if not initialized', async () => {
      const adapter = new MilvusClientWrapper(validConfig);
      await expect(adapter.upsertBatch([{ id: '1', vector: [1], payload: {} }])).rejects.toThrow(
        'not initialized',
      );
    });
  });

  describe('deleteCollection', () => {
    it('should drop collection', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.deleteCollection('my_coll');
      expect(mockClient.dropCollection).toHaveBeenCalledWith({ collection_name: 'my_coll' });
    });

    it('should throw if not initialized', async () => {
      const adapter = new MilvusClientWrapper(validConfig);
      await expect(adapter.deleteCollection('x')).rejects.toThrow('not initialized');
    });
  });

  describe('getCollectionInfo', () => {
    it('should return stats with row count', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.getCollectionStatistics.mockResolvedValue({
        stats: [{ key: 'row_count', value: '42' }],
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('test_coll');
      expect(info).toEqual({
        collectionName: 'test_coll',
        vectorCount: 42,
        vectorDimension: 1536,
        indexType: 'IVF_FLAT',
      });
    });

    it('should return 0 vector count when no row_count stat', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.getCollectionStatistics.mockResolvedValue({
        stats: [{ key: 'other_stat', value: '100' }],
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('test_coll');
      expect(info!.vectorCount).toBe(0);
    });

    it('should return null on error', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.getCollectionStatistics.mockRejectedValue(new Error('fail'));
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('bad');
      expect(info).toBeNull();
    });
  });

  describe('listCollections', () => {
    it('should return collection names', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.listCollections.mockResolvedValue({
        data: [{ name: 'c1' }, { name: 'c2' }],
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const names = await adapter.listCollections();
      expect(names).toEqual(['c1', 'c2']);
    });

    it('should handle missing data field', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.listCollections.mockResolvedValue({});
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const names = await adapter.listCollections();
      expect(names).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockClient.listCollections.mockRejectedValue(new Error('fail'));
      const adapter = new MilvusClientWrapper(validConfig);
      const names = await adapter.listCollections();
      expect(names).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true when client responds', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.listCollections.mockResolvedValue({ data: [] });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when client throws', async () => {
      mockClient.listCollections.mockRejectedValue(new Error('down'));
      const adapter = new MilvusClientWrapper(validConfig);
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should close the connection', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.close();
      expect(mockClient.closeConnection).toHaveBeenCalled();
    });

    it('should handle close without initialization', async () => {
      const adapter = new MilvusClientWrapper(validConfig);
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('scanPoints', () => {
    it('should return points', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.query.mockResolvedValue({
        data: [{ id: 'p1', vector: [1, 2, 3], payload: { key: 'val' } }],
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test_coll');
      expect(result.points).toHaveLength(1);
      expect(result.points[0]).toEqual({ id: 'p1', vector: [1, 2, 3], payload: { key: 'val' } });
      expect(mockClient.query).toHaveBeenCalledWith({
        collection_name: 'test_coll',
        output_fields: ['id', 'vector', 'payload'],
        limit: 100,
        offset: 0,
      });
    });

    it('should use cursor as offset', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.query.mockResolvedValue({ data: [] });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.scanPoints('test_coll', { batchSize: 50, cursor: '100' });
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 100,
        }),
      );
    });

    it('should return nextCursor when more results available', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.query.mockResolvedValue({
        data: Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, vector: [i], payload: {} })),
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test_coll', { batchSize: 100 });
      expect(result.nextCursor).toBe('100');
    });

    it('should not return nextCursor when fewer results than limit', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.query.mockResolvedValue({
        data: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, vector: [i], payload: {} })),
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test_coll', { batchSize: 100 });
      expect(result.nextCursor).toBeUndefined();
    });

    it('should parse string payload as JSON', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.query.mockResolvedValue({
        data: [{ id: 'p1', vector: [1], payload: JSON.stringify({ nested: true }) }],
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test_coll');
      expect(result.points[0].payload).toEqual({ nested: true });
    });

    it('should handle empty vector', async () => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.query.mockResolvedValue({
        data: [{ id: 'p1', vector: null, payload: {} }],
      });
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test_coll');
      expect(result.points[0].vector).toEqual([]);
    });

    it('should throw if not initialized', async () => {
      const adapter = new MilvusClientWrapper(validConfig);
      await expect(adapter.scanPoints('test_coll')).rejects.toThrow('not initialized');
    });
  });

  describe('ensureInitialized', () => {
    it('should throw when calling methods before init', async () => {
      const adapter = new MilvusClientWrapper(validConfig);
      await expect(adapter.search({ vector: [1], topK: 5 })).rejects.toThrow('not initialized');
      await expect(adapter.upsertBatch([])).rejects.toThrow('not initialized');
      await expect(adapter.deleteCollection('x')).rejects.toThrow('not initialized');
      await expect(adapter.scanPoints('x')).rejects.toThrow('not initialized');
    });
  });

  describe('buildMilvusFilter - filter building', () => {
    const vector = [0.1, 0.2, 0.3];

    beforeEach(() => {
      mockClient.hasCollection.mockResolvedValue({ value: true });
      mockClient.search.mockResolvedValue({ results: [] });
    });

    async function getExpr(filter: unknown): Promise<string> {
      const adapter = new MilvusClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({ vector, topK: 5, filter: filter as any });
      return mockClient.search.mock.calls[0][0].expr as string;
    }

    it('should handle $and filter', async () => {
      const expr = await getExpr({ $and: [{ status: 'active' }, { age: { $gt: 18 } }] });
      expect(expr).toBe("(payload['status'] == 'active' and payload['age'] > 18)");
    });

    it('should handle $and with single filter', async () => {
      const expr = await getExpr({ $and: [{ status: 'active' }] });
      expect(expr).toBe("payload['status'] == 'active'");
    });

    it('should handle empty $and', async () => {
      const expr = await getExpr({ $and: [] });
      expect(expr).toBe('');
    });

    it('should handle $or filter', async () => {
      const expr = await getExpr({ $or: [{ role: 'admin' }, { role: 'mod' }] });
      expect(expr).toBe("(payload['role'] == 'admin' or payload['role'] == 'mod')");
    });

    it('should handle $or with single filter', async () => {
      const expr = await getExpr({ $or: [{ status: 'active' }] });
      expect(expr).toBe("payload['status'] == 'active'");
    });

    it('should handle empty $or', async () => {
      const expr = await getExpr({ $or: [] });
      expect(expr).toBe('');
    });

    it('should handle $eq operator', async () => {
      const expr = await getExpr({ field: { $eq: 'value' } });
      expect(expr).toBe("payload['field'] == 'value'");
    });

    it('should handle $ne operator', async () => {
      const expr = await getExpr({ field: { $ne: 'value' } });
      expect(expr).toBe("payload['field'] != 'value'");
    });

    it('should handle $in operator', async () => {
      const expr = await getExpr({ field: { $in: ['a', 'b', 'c'] } });
      expect(expr).toBe("payload['field'] in ['a','b','c']");
    });

    it('should handle $nin operator', async () => {
      const expr = await getExpr({ field: { $nin: ['x', 'y'] } });
      expect(expr).toBe("payload['field'] not in ['x','y']");
    });

    it('should handle $gt operator', async () => {
      const expr = await getExpr({ age: { $gt: 21 } });
      expect(expr).toBe("payload['age'] > 21");
    });

    it('should handle $gte operator', async () => {
      const expr = await getExpr({ age: { $gte: 18 } });
      expect(expr).toBe("payload['age'] >= 18");
    });

    it('should handle $lt operator', async () => {
      const expr = await getExpr({ age: { $lt: 65 } });
      expect(expr).toBe("payload['age'] < 65");
    });

    it('should handle $lte operator', async () => {
      const expr = await getExpr({ age: { $lte: 18 } });
      expect(expr).toBe("payload['age'] <= 18");
    });

    it('should handle null value', async () => {
      const expr = await getExpr({ deleted: null });
      expect(expr).toBe("payload['deleted'] == null");
    });

    it('should handle undefined value', async () => {
      const expr = await getExpr({ deleted: undefined });
      expect(expr).toBe("payload['deleted'] == null");
    });

    it('should handle plain value', async () => {
      const expr = await getExpr({ status: 'active' });
      expect(expr).toBe("payload['status'] == 'active'");
    });

    it('should handle numeric plain value', async () => {
      const expr = await getExpr({ count: 42 });
      expect(expr).toBe("payload['count'] == 42");
    });

    it('should escape single quotes in values', async () => {
      const expr = await getExpr({ name: "O'Brien" });
      expect(expr).toBe("payload['name'] == 'O\\'Brien'");
    });

    it('should escape single quotes in field names', async () => {
      const expr = await getExpr({ "it's": 'value' });
      expect(expr).toBe("payload['it\\'s'] == 'value'");
    });

    it('should handle $eq with null', async () => {
      const expr = await getExpr({ field: { $eq: null } });
      expect(expr).toBe("payload['field'] == null");
    });
  });
});

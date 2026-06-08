import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PineconeClientWrapper } from './pinecone-client.js';

const mockQuery = vi.fn();
const mockUpsert = vi.fn();
const mockDescribeIndex = vi.fn();
const mockDescribeIndexStats = vi.fn();
const mockListIndexes = vi.fn();
const mockDeleteIndex = vi.fn();

vi.mock('@pinecone-database/pinecone', () => {
  class MockIndex {
    query = mockQuery;
    upsert = mockUpsert;
    describeIndexStats = mockDescribeIndexStats;
  }

  class MockPinecone {
    index = () => new MockIndex();
    describeIndex = mockDescribeIndex;
    listIndexes = mockListIndexes;
    deleteIndex = mockDeleteIndex;
  }

  return { Pinecone: MockPinecone };
});

vi.mock('@reaatech/hybrid-rag', () => ({
  encodeSparse: vi.fn((text: string) => ({
    indices: text.split('').map((_, i) => i),
    values: text.split('').map(() => 0.5),
  })),
}));

const validConfig = { apiKey: 'test-key', indexName: 'test-index' };

describe('PineconeClientWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should have provider as pinecone', () => {
      const adapter = new PineconeClientWrapper(validConfig);
      expect(adapter.provider).toBe('pinecone');
    });

    it('should expose correct capabilities', () => {
      const adapter = new PineconeClientWrapper(validConfig);
      expect(adapter.capabilities.supportsHybridSearch).toBe(true);
      expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(false);
      expect(adapter.capabilities.supportsMultiTenancy).toBe(true);
      expect(adapter.capabilities.supportsQuantization).toBe(false);
      expect(adapter.capabilities.supportsScan).toBe(false);
      expect(adapter.capabilities.maxBatchSize).toBe(100);
      expect(adapter.capabilities.maxVectorDimension).toBe(20000);
    });

    it('should expose cost model with monthlyBaseCost 70', () => {
      const adapter = new PineconeClientWrapper(validConfig);
      expect(adapter.costModel.costPerQueryEstimate).toBe(0.00001);
      expect(adapter.costModel.costPer1000Upserts).toBe(0.01);
      expect(adapter.costModel.monthlyBaseCost).toBe(70);
    });
  });

  describe('initialize', () => {
    it('should create Pinecone client and validate index', async () => {
      mockDescribeIndex.mockResolvedValue({ name: 'test-index' });

      const adapter = new PineconeClientWrapper(validConfig);
      await adapter.initialize();

      expect(mockDescribeIndex).toHaveBeenCalledWith('test-index');
      expect((adapter as any).initialized).toBe(true);
    });

    it('should throw when index not found', async () => {
      mockDescribeIndex.mockResolvedValue(null);

      const adapter = new PineconeClientWrapper(validConfig);
      await expect(adapter.initialize()).rejects.toThrow('not found');
    });

    it('should be idempotent when called multiple times', async () => {
      mockDescribeIndex.mockResolvedValue({ name: 'test-index' });

      const adapter = new PineconeClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.initialize();

      expect(mockDescribeIndex).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureInitialized', () => {
    it('should throw when accessing methods before initialization', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      expect(() => (adapter as any).ensureInitialized()).toThrow('not initialized');
    });

    it('should throw for search when not initialized', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      await expect(adapter.search({ vector: [0.1], topK: 5 })).rejects.toThrow('not initialized');
    });

    it('should throw for upsertBatch when not initialized', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      await expect(adapter.upsertBatch([])).rejects.toThrow('not initialized');
    });

    it('should throw for getCollectionInfo when not initialized', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      await expect(adapter.getCollectionInfo('test')).rejects.toThrow('not initialized');
    });

    it('should throw for listCollections when not initialized', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      await expect(adapter.listCollections()).rejects.toThrow('not initialized');
    });
  });

  describe('search', () => {
    it('should perform vector search and map results', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({
        matches: [
          {
            id: 'chunk-1',
            score: 0.92,
            metadata: { documentId: 'doc-1', content: 'result text' },
          },
        ],
      });

      const results = await adapter.search({
        vector: [0.1, 0.2, 0.3],
        topK: 5,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: [0.1, 0.2, 0.3],
          topK: 5,
          includeMetadata: true,
        }),
      );
      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe('chunk-1');
      expect(results[0].documentId).toBe('doc-1');
      expect(results[0].content).toBe('result text');
      expect(results[0].score).toBe(0.92);
      expect(results[0].source).toBe('vector');
    });

    it('should perform hybrid search with sparseVector', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        hybridQuery: 'some text',
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.sparseVector).toBeDefined();
      expect((callArg.sparseVector as any).indices).toBeDefined();
      expect((callArg.sparseVector as any).values).toBeDefined();
    });

    it('should mark results as hybrid-native for hybrid queries', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({
        matches: [
          {
            id: 'chunk-1',
            score: 0.9,
            metadata: { documentId: 'doc-1', content: 'Hybrid result' },
          },
        ],
      });

      const results = await adapter.search({
        vector: [0.1],
        topK: 1,
        hybridQuery: 'hybrid query',
      });

      expect(results[0]?.source).toBe('hybrid-native');
    });

    it('should handle empty matches', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results).toHaveLength(0);
    });

    it('should handle missing matches field', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({});

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results).toHaveLength(0);
    });

    it('should handle missing metadata', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({
        matches: [{ id: 'chunk-1', score: 0.5 }],
      });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results[0].documentId).toBe('');
      expect(results[0].content).toBe('');
      expect(results[0].metadata).toEqual({});
    });

    it('should pass filter to query', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $eq: 'active' } },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ status: { $eq: 'active' } });
    });

    it('should use namespace when configured', async () => {
      const adapter = new PineconeClientWrapper({ ...validConfig, namespace: 'ns1' });
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({ vector: [0.1], topK: 5 });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.namespace).toBe('ns1');
    });
  });

  describe('upsertPoint', () => {
    it('should insert a single point', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { upsert: mockUpsert };

      mockUpsert.mockResolvedValue(undefined);

      await adapter.upsertPoint({
        id: 'p1',
        vector: [0.1, 0.2],
        payload: { content: 'hello world' },
      });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const records = (mockUpsert.mock.calls[0][0] as { records: any[] }).records;
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('p1');
      expect(records[0].values).toEqual([0.1, 0.2]);
    });
  });

  describe('upsertBatch', () => {
    it('should upsert records with correct format', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { upsert: mockUpsert };

      mockUpsert.mockResolvedValue(undefined);

      await adapter.upsertBatch([
        { id: 'p1', vector: [0.1], payload: { content: 'text a' } },
        { id: 'p2', vector: [0.2], payload: { content: 'text b' } },
      ]);

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const records = (mockUpsert.mock.calls[0][0] as { records: any[] }).records;
      expect(records).toHaveLength(2);
      expect(records[0].id).toBe('p1');
      expect(records[1].id).toBe('p2');
    });

    it('should derive sparseValues from payload content', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { upsert: mockUpsert };

      mockUpsert.mockResolvedValue(undefined);

      await adapter.upsertBatch([
        { id: 'p1', vector: [0.1], payload: { content: 'hybrid document text' } },
      ]);

      const records = (mockUpsert.mock.calls[0][0] as { records: any[] }).records;
      expect(records[0].sparseValues).toBeDefined();
      expect(records[0].sparseValues.indices.length).toBeGreaterThan(0);
    });

    it('should use provided sparseVector over derived', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { upsert: mockUpsert };

      mockUpsert.mockResolvedValue(undefined);

      await adapter.upsertBatch([
        {
          id: 'p1',
          vector: [0.1],
          payload: { content: 'text' },
          sparseVector: { indices: [99], values: [0.99] },
        },
      ]);

      const records = (mockUpsert.mock.calls[0][0] as { records: any[] }).records;
      expect(records[0].sparseValues.indices).toEqual([99]);
      expect(records[0].sparseValues.values).toEqual([0.99]);
    });

    it('should not add sparseValues for empty content', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { upsert: mockUpsert };

      mockUpsert.mockResolvedValue(undefined);

      await adapter.upsertBatch([{ id: 'p1', vector: [0.1], payload: {} }]);

      const records = (mockUpsert.mock.calls[0][0] as { records: any[] }).records;
      expect(records[0].sparseValues).toBeUndefined();
    });

    it('should not add sparseValues for whitespace-only content', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { upsert: mockUpsert };

      mockUpsert.mockResolvedValue(undefined);

      await adapter.upsertBatch([{ id: 'p1', vector: [0.1], payload: { content: '   ' } }]);

      const records = (mockUpsert.mock.calls[0][0] as { records: any[] }).records;
      expect(records[0].sparseValues).toBeUndefined();
    });

    it('should batch in chunks of maxBatchSize', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { upsert: mockUpsert };

      mockUpsert.mockResolvedValue(undefined);

      const points = Array.from({ length: 250 }, (_, i) => ({
        id: `p${i}`,
        vector: [0.1],
        payload: {},
      }));

      await adapter.upsertBatch(points);

      expect(mockUpsert).toHaveBeenCalledTimes(3);
      expect((mockUpsert.mock.calls[0][0] as { records: any[] }).records.length).toBe(100);
      expect((mockUpsert.mock.calls[1][0] as { records: any[] }).records.length).toBe(100);
      expect((mockUpsert.mock.calls[2][0] as { records: any[] }).records.length).toBe(50);
    });
  });

  describe('deleteCollection', () => {
    it('should throw not supported error', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;

      await expect(adapter.deleteCollection('test')).rejects.toThrow(
        'does not support collection management',
      );
    });
  });

  describe('getCollectionInfo', () => {
    it('should return stats from describeIndexStats', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { describeIndexStats: mockDescribeIndexStats };

      mockDescribeIndexStats.mockResolvedValue({
        totalRecordCount: 100,
        dimension: 1536,
      });

      const stats = await adapter.getCollectionInfo('test-index');

      expect(stats).toEqual({
        collectionName: 'test-index',
        vectorCount: 100,
        vectorDimension: 1536,
      });
    });

    it('should return null on error', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { describeIndexStats: mockDescribeIndexStats };

      mockDescribeIndexStats.mockRejectedValue(new Error('API error'));

      const stats = await adapter.getCollectionInfo('test-index');
      expect(stats).toBeNull();
    });

    it('should extract dimension from namespace fallback', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { describeIndexStats: mockDescribeIndexStats };

      mockDescribeIndexStats.mockResolvedValue({
        totalRecordCount: 50,
        namespaces: { '': { dimension: 768 } },
      });

      const stats = await adapter.getCollectionInfo('test-index');
      expect(stats?.vectorDimension).toBe(768);
    });

    it('should return 0 dimension when no dimension info available', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { describeIndexStats: mockDescribeIndexStats };

      mockDescribeIndexStats.mockResolvedValue({
        totalRecordCount: 50,
        namespaces: {},
      });

      const stats = await adapter.getCollectionInfo('test-index');
      expect(stats?.vectorDimension).toBe(0);
    });
  });

  describe('listCollections', () => {
    it('should return list of index names', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };
      (adapter as any).client = { listIndexes: mockListIndexes };

      mockListIndexes.mockResolvedValue({
        indexes: [{ name: 'idx1' }, { name: 'idx2' }],
      });

      const indexes = await adapter.listCollections();
      expect(indexes).toEqual(['idx1', 'idx2']);
    });

    it('should handle missing indexes field', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };
      (adapter as any).client = { listIndexes: mockListIndexes };

      mockListIndexes.mockResolvedValue({});

      const indexes = await adapter.listCollections();
      expect(indexes).toEqual([]);
    });

    it('should return empty array on error', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };
      (adapter as any).client = { listIndexes: mockListIndexes };

      mockListIndexes.mockRejectedValue(new Error('API error'));

      const indexes = await adapter.listCollections();
      expect(indexes).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true when describeIndexStats succeeds', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { describeIndexStats: mockDescribeIndexStats };

      mockDescribeIndexStats.mockResolvedValue({});

      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when describeIndexStats fails', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { describeIndexStats: mockDescribeIndexStats };

      mockDescribeIndexStats.mockRejectedValue(new Error('error'));

      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should be a noop', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('buildStandardFilter', () => {
    it('should handle $and logical filter', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: {
          $and: [{ status: { $eq: 'active' } }, { age: { $gt: 18 } }],
        },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({
        $and: [{ status: { $eq: 'active' } }, { age: { $gt: 18 } }],
      });
    });

    it('should handle $or logical filter', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: {
          $or: [{ role: { $eq: 'admin' } }, { role: { $eq: 'user' } }],
        },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({
        $or: [{ role: { $eq: 'admin' } }, { role: { $eq: 'user' } }],
      });
    });

    it('should handle null value as $eq null', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { deleted_at: null },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ deleted_at: { $eq: null } });
    });

    it('should handle $ne operator', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $ne: 'inactive' } },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ status: { $ne: 'inactive' } });
    });

    it('should handle $in operator', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $in: ['a', 'b'] } },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ status: { $in: ['a', 'b'] } });
    });

    it('should handle $nin operator', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $nin: ['x'] } },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ status: { $nin: ['x'] } });
    });

    it('should handle $gte operator', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { age: { $gte: 21 } },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ age: { $gte: 21 } });
    });

    it('should handle $lte operator', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { price: { $lte: 100 } },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ price: { $lte: 100 } });
    });

    it('should handle $lt operator', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { price: { $lt: 50 } },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ price: { $lt: 50 } });
    });

    it('should handle $exists operator', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { email: { $exists: true } },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ email: { $exists: true } });
    });

    it('should handle shorthand value filter', async () => {
      const adapter = new PineconeClientWrapper(validConfig);
      (adapter as any).initialized = true;
      (adapter as any).index = { query: mockQuery };

      mockQuery.mockResolvedValue({ matches: [] });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { department: 'engineering' },
      });

      const callArg = mockQuery.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.filter).toEqual({ department: 'engineering' });
    });
  });
});

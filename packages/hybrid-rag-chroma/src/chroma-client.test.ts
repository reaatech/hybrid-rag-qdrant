import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromaClientWrapper } from './chroma-client.js';

const mocks = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockUpsert = vi.fn();
  const mockGet = vi.fn();
  const mockCount = vi.fn();
  const mockDelete = vi.fn();
  const mockHeartbeat = vi.fn();
  const mockGetOrCreateCollection = vi.fn();
  const mockGetCollection = vi.fn();
  const mockListCollections = vi.fn();
  const mockDeleteCollection = vi.fn();

  const mockCollection = {
    query: mockQuery,
    upsert: mockUpsert,
    get: mockGet,
    count: mockCount,
    delete: mockDelete,
  };

  return {
    mockQuery,
    mockUpsert,
    mockGet,
    mockCount,
    mockDelete,
    mockHeartbeat,
    mockGetOrCreateCollection,
    mockGetCollection,
    mockListCollections,
    mockDeleteCollection,
    mockCollection,
  };
});

vi.mock('chromadb', () => {
  class MockChromaClient {
    getOrCreateCollection = mocks.mockGetOrCreateCollection;
    getCollection = mocks.mockGetCollection;
    listCollections = mocks.mockListCollections;
    deleteCollection = mocks.mockDeleteCollection;
    heartbeat = mocks.mockHeartbeat;
  }

  return { ChromaClient: MockChromaClient };
});

describe('ChromaClientWrapper', () => {
  const validConfig = { collectionName: 'test-collection' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetOrCreateCollection.mockResolvedValue(mocks.mockCollection);
  });

  describe('constructor', () => {
    it('should set provider, capabilities, and costModel', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      expect(adapter.provider).toBe('chroma');
      expect(adapter.capabilities.supportsHybridSearch).toBe(false);
      expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(true);
      expect(adapter.capabilities.supportsMultiTenancy).toBe(true);
      expect(adapter.capabilities.supportsQuantization).toBe(false);
      expect(adapter.capabilities.supportsScan).toBe(true);
      expect(adapter.capabilities.maxBatchSize).toBe(5461);
      expect(adapter.capabilities.maxVectorDimension).toBe(20000);
      expect(adapter.costModel.costPerQueryEstimate).toBe(0);
      expect(adapter.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should create client and getOrCreateCollection with embeddingFunction null', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      expect(mocks.mockGetOrCreateCollection).toHaveBeenCalledWith({
        name: 'test-collection',
        embeddingFunction: null,
      });
    });

    it('should not re-initialize when already initialized', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.initialize();
      expect(mocks.mockGetOrCreateCollection).toHaveBeenCalledTimes(1);
    });

    it('should coalesce concurrent initialize calls', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      await Promise.all([adapter.initialize(), adapter.initialize()]);
      expect(mocks.mockGetOrCreateCollection).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureInitialized', () => {
    it('should throw for search before initialize', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      await expect(adapter.search({ vector: [1], topK: 10 })).rejects.toThrow(
        'ChromaClientWrapper not initialized',
      );
    });

    it('should throw for upsertBatch before initialize', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      await expect(adapter.upsertBatch([])).rejects.toThrow('ChromaClientWrapper not initialized');
    });

    it('should throw for deleteCollection before initialize', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      await expect(adapter.deleteCollection('c')).rejects.toThrow(
        'ChromaClientWrapper not initialized',
      );
    });

    it('should throw for scanPoints before initialize', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      await expect(adapter.scanPoints('c')).rejects.toThrow('ChromaClientWrapper not initialized');
    });
  });

  describe('search', () => {
    it('should map query results to RetrievalResult with 1-distance score', async () => {
      mocks.mockQuery.mockResolvedValue({
        ids: [['id1', 'id2']],
        distances: [[0.1, 0.3]],
        metadatas: [[{ documentId: 'doc1' }, { documentId: 'doc2' }]],
        documents: [['content1', 'content2']],
      });
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [1, 2], topK: 2 });
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        chunkId: 'id1',
        documentId: 'doc1',
        content: 'content1',
        score: 0.9,
        source: 'vector',
        metadata: { documentId: 'doc1' },
      });
      expect(results[1]).toEqual({
        chunkId: 'id2',
        documentId: 'doc2',
        content: 'content2',
        score: 0.7,
        source: 'vector',
        metadata: { documentId: 'doc2' },
      });
    });

    it('should handle empty results', async () => {
      mocks.mockQuery.mockResolvedValue({
        ids: [[]],
        distances: [[]],
        metadatas: [[]],
        documents: [[]],
      });
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [1], topK: 10 });
      expect(results).toHaveLength(0);
    });

    it('should pass filter as where clause', async () => {
      mocks.mockQuery.mockResolvedValue({
        ids: [[]],
        distances: [[]],
        metadatas: [[]],
        documents: [[]],
      });
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({ vector: [1], topK: 10, filter: { field: 'value' } });
      expect(mocks.mockQuery).toHaveBeenCalledWith({
        queryEmbeddings: [[1]],
        nResults: 10,
        where: { field: 'value' },
      });
    });

    it('should omit where when filter is undefined', async () => {
      mocks.mockQuery.mockResolvedValue({
        ids: [[]],
        distances: [[]],
        metadatas: [[]],
        documents: [[]],
      });
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({ vector: [1], topK: 10 });
      expect(mocks.mockQuery).toHaveBeenCalledWith({
        queryEmbeddings: [[1]],
        nResults: 10,
      });
    });

    it('should handle missing optional fields in query result', async () => {
      mocks.mockQuery.mockResolvedValue({});
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [1], topK: 10 });
      expect(results).toHaveLength(0);
    });
  });

  describe('upsertPoint', () => {
    it('should delegate to upsertBatch', async () => {
      mocks.mockUpsert.mockResolvedValue(undefined);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const point = { id: 'p1', vector: [1], payload: { content: 'hello' } };
      await adapter.upsertPoint(point);
      expect(mocks.mockUpsert).toHaveBeenCalledWith({
        ids: ['p1'],
        embeddings: [[1]],
        metadatas: [{ content: 'hello' }],
        documents: ['hello'],
      });
    });
  });

  describe('upsertBatch', () => {
    it('should upsert points with correct format using content from payload', async () => {
      mocks.mockUpsert.mockResolvedValue(undefined);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const points = [
        { id: 'p1', vector: [1], payload: { content: 'hello', extra: 1 } },
        { id: 'p2', vector: [2], payload: { content: 'world' } },
      ];
      await adapter.upsertBatch(points);
      expect(mocks.mockUpsert).toHaveBeenCalledWith({
        ids: ['p1', 'p2'],
        embeddings: [[1], [2]],
        metadatas: [{ content: 'hello', extra: 1 }, { content: 'world' }],
        documents: ['hello', 'world'],
      });
    });

    it('should batch when points exceed maxBatchSize', async () => {
      mocks.mockUpsert.mockResolvedValue(undefined);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const points = Array.from({ length: 6000 }, (_, i) => ({
        id: `p${i}`,
        vector: [i],
        payload: { content: `c${i}` },
      }));
      await adapter.upsertBatch(points);
      expect(mocks.mockUpsert).toHaveBeenCalledTimes(2);
      expect(mocks.mockUpsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ ids: points.slice(0, 5461).map((p) => p.id) }),
      );
      expect(mocks.mockUpsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ ids: points.slice(5461).map((p) => p.id) }),
      );
    });

    it('should handle empty payload content gracefully', async () => {
      mocks.mockUpsert.mockResolvedValue(undefined);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const points = [{ id: 'p1', vector: [1], payload: {} }];
      await adapter.upsertBatch(points);
      expect(mocks.mockUpsert).toHaveBeenCalledWith({
        ids: ['p1'],
        embeddings: [[1]],
        metadatas: [{}],
        documents: [''],
      });
    });
  });

  describe('deleteCollection', () => {
    it('should call client.deleteCollection with name', async () => {
      mocks.mockDeleteCollection.mockResolvedValue(undefined);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.deleteCollection('my-collection');
      expect(mocks.mockDeleteCollection).toHaveBeenCalledWith({ name: 'my-collection' });
    });
  });

  describe('getCollectionInfo', () => {
    it('should return stats with count', async () => {
      const mockCol = { count: vi.fn().mockResolvedValue(42) };
      mocks.mockGetCollection.mockResolvedValue(mockCol);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('my-collection');
      expect(info).toEqual({
        collectionName: 'my-collection',
        vectorCount: 42,
        vectorDimension: 0,
      });
      expect(mocks.mockGetCollection).toHaveBeenCalledWith({ name: 'my-collection' });
    });

    it('should return null on error', async () => {
      mocks.mockGetCollection.mockRejectedValue(new Error('not found'));
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('missing');
      expect(info).toBeNull();
    });
  });

  describe('listCollections', () => {
    it('should map object collections to names', async () => {
      mocks.mockListCollections.mockResolvedValue([{ name: 'c1' }, { name: 'c2' }]);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const names = await adapter.listCollections();
      expect(names).toEqual(['c1', 'c2']);
    });

    it('should handle string-only collections', async () => {
      mocks.mockListCollections.mockResolvedValue(['c1', 'c2']);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const names = await adapter.listCollections();
      expect(names).toEqual(['c1', 'c2']);
    });

    it('should return empty array on error', async () => {
      mocks.mockListCollections.mockRejectedValue(new Error('fail'));
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const names = await adapter.listCollections();
      expect(names).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true on successful heartbeat', async () => {
      mocks.mockHeartbeat.mockResolvedValue(undefined);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false on heartbeat error', async () => {
      mocks.mockHeartbeat.mockRejectedValue(new Error('down'));
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });

    it('should return false when not initialized', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should be a no-op', async () => {
      const adapter = new ChromaClientWrapper(validConfig);
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('scanPoints', () => {
    it('should call get with default limit and offset 0 and map results', async () => {
      mocks.mockGet.mockResolvedValue({
        ids: ['id1', 'id2'],
        embeddings: [
          [1, 2],
          [3, 4],
        ],
        metadatas: [{ a: 1 }, { a: 2 }],
      });
      mocks.mockCount.mockResolvedValue(5);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col');
      expect(result.points).toHaveLength(2);
      expect(result.points[0]).toEqual({ id: 'id1', vector: [1, 2], payload: { a: 1 } });
      expect(result.points[1]).toEqual({ id: 'id2', vector: [3, 4], payload: { a: 2 } });
      expect(result.nextCursor).toBe('2');
      expect(mocks.mockGet).toHaveBeenCalledWith({ limit: 100, offset: 0 });
    });

    it('should use custom batchSize and cursor', async () => {
      mocks.mockGet.mockResolvedValue({
        ids: ['id1'],
        embeddings: [[1]],
        metadatas: [{}],
      });
      mocks.mockCount.mockResolvedValue(10);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col', { batchSize: 5, cursor: '3' });
      expect(mocks.mockGet).toHaveBeenCalledWith({ limit: 5, offset: 3 });
      expect(result.nextCursor).toBe('4');
    });

    it('should not return nextCursor when at end', async () => {
      mocks.mockGet.mockResolvedValue({
        ids: ['id1'],
        embeddings: [[1]],
        metadatas: [{}],
      });
      mocks.mockCount.mockResolvedValue(1);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col');
      expect(result.nextCursor).toBeUndefined();
    });

    it('should handle missing embeddings and metadatas', async () => {
      mocks.mockGet.mockResolvedValue({
        ids: ['id1'],
      });
      mocks.mockCount.mockResolvedValue(1);
      const adapter = new ChromaClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col');
      expect(result.points).toHaveLength(1);
      expect(result.points[0]).toEqual({ id: 'id1', vector: [], payload: {} });
    });
  });

  describe('buildChromaFilter', () => {
    it('should handle $and', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ $and: [{ a: 1 }, { b: 2 }] });
      expect(result).toEqual({ $and: [{ a: 1 }, { b: 2 }] });
    });

    it('should handle nested $and and $or', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({
        $and: [{ a: 1 }, { $or: [{ b: 2 }, { c: 3 }] }],
      });
      expect(result).toEqual({
        $and: [{ a: 1 }, { $or: [{ b: 2 }, { c: 3 }] }],
      });
    });

    it('should map $eq by unwrapping', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $eq: 'val' } });
      expect(result).toEqual({ field: 'val' });
    });

    it('should map $ne', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $ne: 'val' } });
      expect(result).toEqual({ field: { $ne: 'val' } });
    });

    it('should map $in', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $in: ['a', 'b'] } });
      expect(result).toEqual({ field: { $in: ['a', 'b'] } });
    });

    it('should map $nin', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $nin: ['a', 'b'] } });
      expect(result).toEqual({ field: { $nin: ['a', 'b'] } });
    });

    it('should map $gt', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $gt: 10 } });
      expect(result).toEqual({ field: { $gt: 10 } });
    });

    it('should map $gte', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $gte: 10 } });
      expect(result).toEqual({ field: { $gte: 10 } });
    });

    it('should map $lt', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $lt: 10 } });
      expect(result).toEqual({ field: { $lt: 10 } });
    });

    it('should map $lte', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $lte: 10 } });
      expect(result).toEqual({ field: { $lte: 10 } });
    });

    it('should map $exists true to $ne: null', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $exists: true } });
      expect(result).toEqual({ field: { $ne: null } });
    });

    it('should map $exists false to null', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: { $exists: false } });
      expect(result).toEqual({ field: null });
    });

    it('should map null value to $eq: null', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: null });
      expect(result).toEqual({ field: { $eq: null } });
    });

    it('should map undefined value to $eq: null', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: undefined });
      expect(result).toEqual({ field: { $eq: null } });
    });

    it('should map simple value as direct equality', () => {
      const adapter = new ChromaClientWrapper(validConfig);
      const result = (adapter as any).buildChromaFilter({ field: 'direct' });
      expect(result).toEqual({ field: 'direct' });
    });
  });
});

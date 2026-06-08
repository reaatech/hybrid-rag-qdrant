import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeaviateClientWrapper } from './weaviate-client.js';

const mocks = vi.hoisted(() => {
  const mockHybrid = vi.fn();
  const mockNearVector = vi.fn();
  const mockBM25 = vi.fn();
  const mockInsertMany = vi.fn();
  const mockAggregateOverAll = vi.fn();
  const mockGet = vi.fn();
  const mockCreate = vi.fn();
  const mockDelete = vi.fn();
  const mockListAll = vi.fn();
  const mockGetMeta = vi.fn();
  const mockClose = vi.fn();
  const mockConnectToLocal = vi.fn();
  const mockConnectToWeaviateCloud = vi.fn();
  const mockApiKeyCtor = vi.fn();

  const mockCollection = {
    query: {
      hybrid: mockHybrid,
      nearVector: mockNearVector,
      bm25: mockBM25,
    },
    data: {
      insertMany: mockInsertMany,
    },
    aggregate: {
      overAll: mockAggregateOverAll,
    },
  };

  const mockClient = {
    collections: {
      get: mockGet,
      create: mockCreate,
      delete: mockDelete,
      listAll: mockListAll,
    },
    getMeta: mockGetMeta,
    close: mockClose,
  };

  mockGet.mockReturnValue(mockCollection);
  mockConnectToLocal.mockResolvedValue(mockClient);
  mockConnectToWeaviateCloud.mockResolvedValue(mockClient);
  mockAggregateOverAll.mockResolvedValue({ totalCount: 100 });

  const byProperty = vi.fn().mockImplementation((key: string) => ({
    isNull: vi.fn().mockReturnValue(`isNull(${key})`),
    equal: vi.fn().mockReturnValue(`eq(${key})`),
    notEqual: vi.fn().mockReturnValue(`ne(${key})`),
    containsAny: vi.fn().mockReturnValue(`containsAny(${key})`),
    containsNone: vi.fn().mockReturnValue(`containsNone(${key})`),
    greaterThan: vi.fn().mockReturnValue(`gt(${key})`),
    greaterOrEqual: vi.fn().mockReturnValue(`gte(${key})`),
    lessThan: vi.fn().mockReturnValue(`lt(${key})`),
    lessOrEqual: vi.fn().mockReturnValue(`lte(${key})`),
  }));

  const wFilters = {
    and: vi.fn((...args: string[]) => `and(${args.join(',')})`),
    or: vi.fn((...args: string[]) => `or(${args.join(',')})`),
    byProperty,
  };

  return {
    mockHybrid,
    mockNearVector,
    mockBM25,
    mockInsertMany,
    mockAggregateOverAll,
    mockGet,
    mockCreate,
    mockDelete,
    mockListAll,
    mockGetMeta,
    mockClose,
    mockConnectToLocal,
    mockConnectToWeaviateCloud,
    mockApiKeyCtor,
    mockCollection,
    mockClient,
    wFilters,
    byProperty,
  };
});

vi.mock('weaviate-client', () => {
  class MockApiKey {
    constructor(key: string) {
      mocks.mockApiKeyCtor(key);
    }
  }

  return {
    default: {
      connectToLocal: mocks.mockConnectToLocal,
      connectToWeaviateCloud: mocks.mockConnectToWeaviateCloud,
      ApiKey: MockApiKey,
      configure: {
        vectorizer: { none: vi.fn() },
        multiTenancy: vi.fn(),
      },
      Filters: mocks.wFilters,
    },
  };
});

describe('WeaviateClientWrapper', () => {
  const validConfig = { url: 'http://localhost:8080', className: 'TestClass' };
  const apiKeyConfig = { url: 'http://localhost:8080', className: 'TestClass', apiKey: 'my-key' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGet.mockReturnValue(mocks.mockCollection);
    mocks.mockConnectToLocal.mockResolvedValue(mocks.mockClient);
    mocks.mockConnectToWeaviateCloud.mockResolvedValue(mocks.mockClient);
    mocks.mockAggregateOverAll.mockResolvedValue({ totalCount: 100 });
  });

  describe('constructor', () => {
    it('should set provider, capabilities, and costModel', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      expect(adapter.provider).toBe('weaviate');
      expect(adapter.capabilities.supportsHybridSearch).toBe(true);
      expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(true);
      expect(adapter.capabilities.supportsMultiTenancy).toBe(true);
      expect(adapter.capabilities.supportsQuantization).toBe(false);
      expect(adapter.capabilities.supportsScan).toBe(true);
      expect(adapter.capabilities.maxBatchSize).toBe(100);
      expect(adapter.capabilities.maxVectorDimension).toBe(65535);
      expect(adapter.costModel.costPerQueryEstimate).toBe(0);
      expect(adapter.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should connect to local when no apiKey', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      expect(mocks.mockConnectToLocal).toHaveBeenCalledWith({
        host: 'localhost',
        port: 8080,
      });
      expect(mocks.mockCreate).toHaveBeenCalled();
      expect(mocks.mockConnectToWeaviateCloud).not.toHaveBeenCalled();
    });

    it('should connect to cloud when apiKey is provided', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(apiKeyConfig);
      await adapter.initialize();
      expect(mocks.mockConnectToWeaviateCloud).toHaveBeenCalledWith('http://localhost:8080/', {
        authCredentials: expect.anything(),
      });
      expect(mocks.mockApiKeyCtor).toHaveBeenCalledWith('my-key');
      expect(mocks.mockConnectToLocal).not.toHaveBeenCalled();
    });

    it('should handle collection creation failure gracefully', async () => {
      mocks.mockCreate.mockRejectedValue(new Error('already exists'));
      const adapter = new WeaviateClientWrapper(validConfig);
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });

    it('should not re-initialize when already initialized', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.initialize();
      expect(mocks.mockConnectToLocal).toHaveBeenCalledTimes(1);
    });

    it('should coalesce concurrent initialize calls', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await Promise.all([adapter.initialize(), adapter.initialize()]);
      expect(mocks.mockConnectToLocal).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureInitialized', () => {
    it('should throw for search before initialize', async () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      await expect(adapter.search({ vector: [1], topK: 10 })).rejects.toThrow(
        'WeaviateClientWrapper not initialized',
      );
    });

    it('should throw for upsertBatch before initialize', async () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      await expect(adapter.upsertBatch([])).rejects.toThrow(
        'WeaviateClientWrapper not initialized',
      );
    });

    it('should throw for deleteCollection before initialize', async () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      await expect(adapter.deleteCollection('c')).rejects.toThrow(
        'WeaviateClientWrapper not initialized',
      );
    });

    it('should throw for scanPoints before initialize', async () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      await expect(adapter.scanPoints('c')).rejects.toThrow(
        'WeaviateClientWrapper not initialized',
      );
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
    });

    it('should perform hybrid search when hybridQuery is provided', async () => {
      mocks.mockHybrid.mockResolvedValue({
        objects: [
          {
            uuid: 'id1',
            properties: { documentId: 'doc1', content: 'hello' },
            metadata: { distance: 0.9 },
          },
        ],
      });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({
        vector: [1, 2],
        topK: 5,
        hybridQuery: 'test query',
        hybridAlpha: 0.7,
      });
      expect(mocks.mockHybrid).toHaveBeenCalledWith('test query', {
        vector: [1, 2],
        alpha: 0.7,
        limit: 5,
        returnMetadata: ['distance'],
        filters: undefined,
      });
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        chunkId: 'id1',
        documentId: 'doc1',
        content: 'hello',
        score: 0.9,
        source: 'hybrid-native',
        metadata: { documentId: 'doc1', content: 'hello' },
      });
    });

    it('should use default alpha of 0.5 for hybrid search', async () => {
      mocks.mockHybrid.mockResolvedValue({ objects: [] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({
        vector: [1],
        topK: 5,
        hybridQuery: 'q',
      });
      expect(mocks.mockHybrid).toHaveBeenCalledWith('q', expect.objectContaining({ alpha: 0.5 }));
    });

    it('should handle missing objects in hybrid search', async () => {
      mocks.mockHybrid.mockResolvedValue({});
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({
        vector: [1],
        topK: 5,
        hybridQuery: 'q',
      });
      expect(results).toHaveLength(0);
    });

    it('should perform nearVector search when hybridQuery is not provided', async () => {
      mocks.mockNearVector.mockResolvedValue({
        objects: [
          {
            uuid: 'id1',
            properties: { documentId: 'doc1', content: 'hello' },
            metadata: { distance: 0.8 },
          },
        ],
      });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [1, 2], topK: 5 });
      expect(mocks.mockNearVector).toHaveBeenCalledWith([1, 2], {
        limit: 5,
        returnMetadata: ['distance'],
        filters: undefined,
      });
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        chunkId: 'id1',
        documentId: 'doc1',
        content: 'hello',
        score: 0.8,
        source: 'vector',
        metadata: { documentId: 'doc1', content: 'hello' },
      });
    });

    it('should handle empty objects array', async () => {
      mocks.mockNearVector.mockResolvedValue({ objects: [] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [1], topK: 5 });
      expect(results).toHaveLength(0);
    });

    it('should handle missing objects', async () => {
      mocks.mockNearVector.mockResolvedValue({});
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [1], topK: 5 });
      expect(results).toHaveLength(0);
    });

    it('should use id fallback when uuid is missing', async () => {
      mocks.mockNearVector.mockResolvedValue({
        objects: [{ id: 'obj-id', properties: {}, metadata: {} }],
      });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [1], topK: 5 });
      expect(results[0].chunkId).toBe('obj-id');
    });

    it('should pass filter to hybrid search', async () => {
      mocks.mockHybrid.mockResolvedValue({ objects: [] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({
        vector: [1],
        topK: 5,
        hybridQuery: 'q',
        filter: { field: { $eq: 'val' } },
      });
      const callArgs = mocks.mockHybrid.mock.calls[0][1];
      expect(callArgs.filters).toBe('eq(field)');
    });

    it('should pass filter to nearVector search', async () => {
      mocks.mockNearVector.mockResolvedValue({ objects: [] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({
        vector: [1],
        topK: 5,
        filter: { field: { $eq: 'val' } },
      });
      const callArgs = mocks.mockNearVector.mock.calls[0][1];
      expect(callArgs.filters).toBe('eq(field)');
    });
  });

  describe('upsertPoint', () => {
    it('should delegate to upsertBatch', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      mocks.mockInsertMany.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.upsertPoint({ id: 'p1', vector: [1], payload: { content: 'test' } });
      expect(mocks.mockInsertMany).toHaveBeenCalledWith([
        { id: 'p1', vector: [1], properties: { content: 'test' } },
      ]);
    });
  });

  describe('upsertBatch', () => {
    it('should insert points with correct format', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      mocks.mockInsertMany.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const points = [
        { id: 'p1', vector: [1], payload: { content: 'hello', extra: 1 } },
        { id: 'p2', vector: [2], payload: { content: 'world' } },
      ];
      await adapter.upsertBatch(points);
      expect(mocks.mockInsertMany).toHaveBeenCalledWith([
        { id: 'p1', vector: [1], properties: { content: 'hello', extra: 1 } },
        { id: 'p2', vector: [2], properties: { content: 'world' } },
      ]);
    });
  });

  describe('deleteCollection', () => {
    it('should call client.collections.delete', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      mocks.mockDelete.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.deleteCollection('my-collection');
      expect(mocks.mockDelete).toHaveBeenCalledWith('my-collection');
    });
  });

  describe('getCollectionInfo', () => {
    it('should return stats with totalCount', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      mocks.mockAggregateOverAll.mockResolvedValue({ totalCount: 42 });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('my-collection');
      expect(info).toEqual({
        collectionName: 'my-collection',
        vectorCount: 42,
        vectorDimension: 0,
      });
      expect(mocks.mockGet).toHaveBeenCalledWith('my-collection');
    });

    it('should return null on error', async () => {
      mocks.mockGet.mockImplementation(() => {
        throw new Error('fail');
      });
      mocks.mockCreate.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('missing');
      expect(info).toBeNull();
    });

    it('should return null when not initialized', async () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const info = await adapter.getCollectionInfo('col');
      expect(info).toBeNull();
    });
  });

  describe('listCollections', () => {
    it('should return collection names', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      mocks.mockListAll.mockResolvedValue([{ name: 'col1' }, { name: 'col2' }]);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const names = await adapter.listCollections();
      expect(names).toEqual(['col1', 'col2']);
    });

    it('should return empty array on error', async () => {
      mocks.mockListAll.mockRejectedValue(new Error('fail'));
      mocks.mockCreate.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const names = await adapter.listCollections();
      expect(names).toEqual([]);
    });

    it('should return empty array when not initialized', async () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const names = await adapter.listCollections();
      expect(names).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true on successful getMeta', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      mocks.mockGetMeta.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false on error', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      mocks.mockGetMeta.mockRejectedValue(new Error('down'));
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });

    it('should return false when not initialized', async () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should call client.close when initialized', async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
      mocks.mockClose.mockResolvedValue(undefined);
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.close();
      expect(mocks.mockClose).toHaveBeenCalled();
    });

    it('should not throw when not initialized', async () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('scanPoints', () => {
    beforeEach(async () => {
      mocks.mockCreate.mockResolvedValue(undefined);
    });

    it('should call bm25 with default limit and no after', async () => {
      mocks.mockBM25.mockResolvedValue({ objects: [] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.scanPoints('col');
      expect(mocks.mockBM25).toHaveBeenCalledWith('', {
        limit: 100,
        after: undefined,
      });
    });

    it('should use custom batchSize and cursor', async () => {
      mocks.mockBM25.mockResolvedValue({
        objects: [
          { uuid: 'id1', vector: [1], properties: { a: 1 } },
          { uuid: 'id2', vector: [2], properties: { a: 2 } },
        ],
      });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col', { batchSize: 2, cursor: 'cursor-1' });
      expect(mocks.mockBM25).toHaveBeenCalledWith('', {
        limit: 2,
        after: 'cursor-1',
      });
      expect(result.points).toHaveLength(2);
      expect(result.points[0]).toEqual({ id: 'id1', vector: [1], payload: { a: 1 } });
    });

    it('should return nextCursor when batch is full', async () => {
      mocks.mockBM25.mockResolvedValue({
        objects: [
          { uuid: 'id1', vector: [1], properties: {} },
          { uuid: 'id2', vector: [2], properties: {} },
        ],
      });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col', { batchSize: 2 });
      expect(result.nextCursor).toBe('id2');
    });

    it('should not return nextCursor when batch is partial', async () => {
      mocks.mockBM25.mockResolvedValue({
        objects: [{ uuid: 'id1', vector: [1], properties: {} }],
      });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col', { batchSize: 100 });
      expect(result.nextCursor).toBeUndefined();
    });

    it('should use id fallback when uuid is missing for nextCursor', async () => {
      mocks.mockBM25.mockResolvedValue({
        objects: [
          { id: 'obj-1', vector: [1], properties: {} },
          { id: 'obj-2', vector: [2], properties: {} },
        ],
      });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col', { batchSize: 2 });
      expect(result.nextCursor).toBe('obj-2');
    });

    it('should handle missing objects', async () => {
      mocks.mockBM25.mockResolvedValue({});
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col');
      expect(result.points).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should handle missing vector and properties in objects', async () => {
      mocks.mockBM25.mockResolvedValue({
        objects: [{ uuid: 'id1' }, { uuid: 'id2' }],
      });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('col', { batchSize: 2 });
      expect(result.points[0].vector).toEqual([]);
      expect(result.points[0].payload).toEqual({});
      expect(result.points[1].vector).toEqual([]);
      expect(result.points[1].payload).toEqual({});
    });
  });

  describe('buildWeaviateFilter', () => {
    it('should handle $and', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const result = (adapter as any).buildWeaviateFilter({ $and: [{ a: 1 }, { b: 2 }] });
      expect(mocks.wFilters.and).toHaveBeenCalledWith('eq(a)', 'eq(b)');
      expect(result).toBe('and(eq(a),eq(b))');
    });

    it('should handle $or', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const result = (adapter as any).buildWeaviateFilter({ $or: [{ a: 1 }, { b: 2 }] });
      expect(mocks.wFilters.or).toHaveBeenCalledWith('eq(a)', 'eq(b)');
      expect(result).toBe('or(eq(a),eq(b))');
    });

    it('should map $eq', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const result = (adapter as any).buildWeaviateFilter({ field: { $eq: 'val' } });
      expect(mocks.byProperty).toHaveBeenCalledWith('field');
      expect(mocks.byProperty.mock.results[0].value.equal).toHaveBeenCalledWith('val');
      expect(result).toBe('eq(field)');
    });

    it('should map $ne', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const result = (adapter as any).buildWeaviateFilter({ field: { $ne: 'val' } });
      expect(mocks.byProperty.mock.results[0].value.notEqual).toHaveBeenCalledWith('val');
      expect(result).toBe('ne(field)');
    });

    it('should map $in with non-empty array', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const result = (adapter as any).buildWeaviateFilter({ field: { $in: ['a', 'b'] } });
      expect(mocks.byProperty.mock.results[0].value.containsAny).toHaveBeenCalledWith(['a', 'b']);
      expect(result).toBe('containsAny(field)');
    });

    it('should handle $in with empty array gracefully', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const result = (adapter as any).buildWeaviateFilter({ field: { $in: [] } });
      expect(mocks.wFilters.and).toHaveBeenCalledWith();
      expect(result).toBe('and()');
    });

    it('should map $nin with non-empty array', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: { $nin: ['a', 'b'] } });
      expect(mocks.byProperty.mock.results[0].value.containsNone).toHaveBeenCalledWith(['a', 'b']);
    });

    it('should handle $nin with empty array gracefully', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const result = (adapter as any).buildWeaviateFilter({ field: { $nin: [] } });
      expect(mocks.wFilters.and).toHaveBeenCalledWith();
      expect(result).toBe('and()');
    });

    it('should map $gt', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: { $gt: 10 } });
      expect(mocks.byProperty.mock.results[0].value.greaterThan).toHaveBeenCalledWith(10);
    });

    it('should map $gte', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: { $gte: 10 } });
      expect(mocks.byProperty.mock.results[0].value.greaterOrEqual).toHaveBeenCalledWith(10);
    });

    it('should map $lt', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: { $lt: 10 } });
      expect(mocks.byProperty.mock.results[0].value.lessThan).toHaveBeenCalledWith(10);
    });

    it('should map $lte', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: { $lte: 10 } });
      expect(mocks.byProperty.mock.results[0].value.lessOrEqual).toHaveBeenCalledWith(10);
    });

    it('should map $exists true', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: { $exists: true } });
      expect(mocks.byProperty.mock.results[0].value.isNull).toHaveBeenCalledWith(false);
    });

    it('should map $exists false', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: { $exists: false } });
      expect(mocks.byProperty.mock.results[0].value.isNull).toHaveBeenCalledWith(true);
    });

    it('should map null value to isNull true', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: null });
      expect(mocks.byProperty.mock.results[0].value.isNull).toHaveBeenCalledWith(true);
    });

    it('should map undefined value to isNull true', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: undefined });
      expect(mocks.byProperty.mock.results[0].value.isNull).toHaveBeenCalledWith(true);
    });

    it('should map simple value as equal', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ field: 'direct' });
      expect(mocks.byProperty.mock.results[0].value.equal).toHaveBeenCalledWith('direct');
    });

    it('should combine multiple conditions with and', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      (adapter as any).buildWeaviateFilter({ a: { $gt: 1 }, b: { $lt: 10 } });
      expect(mocks.wFilters.and).toHaveBeenCalledWith('gt(a)', 'lt(b)');
    });

    it('should handle unknown operator by skipping condition', () => {
      const adapter = new WeaviateClientWrapper(validConfig);
      const result = (adapter as any).buildWeaviateFilter({ field: { $unknown: 'val' } });
      expect(mocks.wFilters.and).toHaveBeenCalledWith();
      expect(result).toBe('and()');
    });
  });

  describe('result mapping fallbacks (branch coverage)', () => {
    beforeEach(() => {
      mocks.mockCreate.mockResolvedValue(undefined);
    });

    it('hybrid search maps objects with missing fields to defaults', async () => {
      mocks.mockHybrid.mockResolvedValue({ objects: [{}] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const res = await adapter.search({ vector: [0.1], topK: 5, hybridQuery: 'q' });
      expect(res[0]).toEqual({
        chunkId: '',
        documentId: '',
        content: '',
        score: 0,
        source: 'hybrid-native',
        metadata: {},
      });
    });

    it('vector search maps objects with missing fields to defaults', async () => {
      mocks.mockNearVector.mockResolvedValue({ objects: [{}] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const res = await adapter.search({ vector: [0.1], topK: 5 });
      expect(res[0]).toEqual({
        chunkId: '',
        documentId: '',
        content: '',
        score: 0,
        source: 'vector',
        metadata: {},
      });
    });

    it('getCollectionInfo defaults vectorCount when totalCount is missing', async () => {
      mocks.mockAggregateOverAll.mockResolvedValueOnce({});
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const info = await adapter.getCollectionInfo('c');
      expect(info).toEqual({ collectionName: 'c', vectorCount: 0, vectorDimension: 0 });
    });

    it('scanPoints maps objects with missing fields to defaults', async () => {
      mocks.mockBM25.mockResolvedValue({ objects: [{}] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      const r = await adapter.scanPoints('c');
      expect(r.points[0]).toEqual({ id: '', vector: [], payload: {} });
    });

    it('buildWeaviateFilter handles $or combinator', async () => {
      mocks.mockNearVector.mockResolvedValue({ objects: [] });
      const adapter = new WeaviateClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({ vector: [0.1], topK: 5, filter: { $or: [{ a: { $eq: 1 } }] } });
      expect(mocks.wFilters.or).toHaveBeenCalled();
    });
  });
});

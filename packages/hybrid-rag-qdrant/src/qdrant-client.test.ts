import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCollections = vi.fn();
const mockCreateCollection = vi.fn();
const mockUpsert = vi.fn();
const mockSearch = vi.fn();
const mockDeleteCollection = vi.fn();
const mockGetCollection = vi.fn();
const mockScroll = vi.fn();
const mockConstructor = vi.fn();

vi.mock('@qdrant/js-client-rest', () => {
  class MockQdrantClient {
    getCollections = mockGetCollections;
    createCollection = mockCreateCollection;
    upsert = mockUpsert;
    search = mockSearch;
    deleteCollection = mockDeleteCollection;
    getCollection = mockGetCollection;
    scroll = mockScroll;
    constructor(opts: unknown) {
      mockConstructor(opts);
    }
  }

  return {
    QdrantClient: MockQdrantClient,
  };
});

import { QdrantClientWrapper } from './qdrant-client.js';

function makeWrapper(
  overrides: Partial<ConstructorParameters<typeof QdrantClientWrapper>[0]> = {},
) {
  return new QdrantClientWrapper({
    url: 'http://localhost:6333',
    apiKey: 'test-key',
    collectionName: 'test-collection',
    vectorSize: 1536,
    distance: 'Cosine',
    ...overrides,
  });
}

describe('QdrantClientWrapper', () => {
  let wrapper: QdrantClientWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    // Sensible defaults; individual tests override as needed.
    mockGetCollections.mockResolvedValue({ collections: [] });
    mockCreateCollection.mockResolvedValue({});
    mockUpsert.mockResolvedValue({});
    mockSearch.mockResolvedValue([]);
    mockDeleteCollection.mockResolvedValue({});
    mockGetCollection.mockResolvedValue({
      points_count: 100,
      config: { params: { vectors: { size: 1536, distance: 'Cosine' } } },
    });
    mockScroll.mockResolvedValue({ points: [], next_page_offset: null });
    wrapper = makeWrapper();
  });

  describe('constructor', () => {
    it('should accept valid config and pass url + apiKey to client', () => {
      expect(wrapper).toBeInstanceOf(QdrantClientWrapper);
      expect(mockConstructor).toHaveBeenCalledWith({
        url: 'http://localhost:6333',
        apiKey: 'test-key',
        checkCompatibility: false,
      });
    });

    it('should accept config without optional fields', () => {
      const w = new QdrantClientWrapper({
        url: 'http://localhost:6333',
        collectionName: 'docs',
        vectorSize: 768,
      });
      expect(w).toBeInstanceOf(QdrantClientWrapper);
      expect(mockConstructor).toHaveBeenLastCalledWith({
        url: 'http://localhost:6333',
        apiKey: undefined,
        checkCompatibility: false,
      });
    });
  });

  describe('provider / capabilities / costModel', () => {
    it('should have provider set to qdrant', () => {
      expect(wrapper.provider).toBe('qdrant');
    });

    it('should report capabilities including supportsScan', () => {
      expect(wrapper.capabilities).toEqual({
        supportsHybridSearch: false,
        supportsMetadataFiltering: true,
        supportsBatchUpsert: true,
        supportsCollectionManagement: true,
        supportsMultiTenancy: false,
        supportsQuantization: false,
        supportsScan: true,
        maxBatchSize: 100,
        maxVectorDimension: 65535,
      });
    });

    it('should report zero cost model', () => {
      expect(wrapper.costModel).toEqual({
        costPerQueryEstimate: 0,
        costPer1000Upserts: 0,
      });
    });
  });

  describe('initialize', () => {
    it('should create the collection when it does not exist', async () => {
      mockGetCollections.mockResolvedValue({ collections: [{ name: 'other' }] });
      await wrapper.initialize();
      expect(mockCreateCollection).toHaveBeenCalledWith('test-collection', {
        vectors: { size: 1536, distance: 'Cosine' },
      });
    });

    it('should not create the collection when it already exists', async () => {
      mockGetCollections.mockResolvedValue({ collections: [{ name: 'test-collection' }] });
      await wrapper.initialize();
      expect(mockCreateCollection).not.toHaveBeenCalled();
    });

    it('should default distance to Cosine when not provided', async () => {
      const w = makeWrapper({ distance: undefined });
      mockGetCollections.mockResolvedValue({ collections: [] });
      await w.initialize();
      expect(mockCreateCollection).toHaveBeenCalledWith('test-collection', {
        vectors: { size: 1536, distance: 'Cosine' },
      });
    });

    it('should be idempotent and not re-run after first initialize', async () => {
      await wrapper.initialize();
      mockGetCollections.mockClear();
      mockCreateCollection.mockClear();
      await wrapper.initialize();
      expect(mockGetCollections).not.toHaveBeenCalled();
      expect(mockCreateCollection).not.toHaveBeenCalled();
    });

    it('should return the in-flight init promise on concurrent calls', async () => {
      let resolveGet: (v: unknown) => void = () => {};
      mockGetCollections.mockReturnValue(
        new Promise((resolve) => {
          resolveGet = resolve;
        }),
      );
      const p1 = wrapper.initialize();
      const p2 = wrapper.initialize();
      resolveGet({ collections: [] });
      await Promise.all([p1, p2]);
      // Only one getCollections call despite two initialize() invocations.
      expect(mockGetCollections).toHaveBeenCalledTimes(1);
    });
  });

  describe('collectionExists', () => {
    it('should return true when the collection is present', async () => {
      mockGetCollections.mockResolvedValue({ collections: [{ name: 'test-collection' }] });
      expect(await wrapper.collectionExists('test-collection')).toBe(true);
    });

    it('should return false for non-existent collection', async () => {
      mockGetCollections.mockResolvedValue({ collections: [{ name: 'x' }] });
      expect(await wrapper.collectionExists('non-existent')).toBe(false);
    });

    it('should return false when the API throws', async () => {
      mockGetCollections.mockRejectedValue(new Error('boom'));
      expect(await wrapper.collectionExists('test-collection')).toBe(false);
    });
  });

  describe('createCollection', () => {
    it('should pass through size and distance', async () => {
      await wrapper.createCollection('mycoll', { size: 384, distance: 'Dot' });
      expect(mockCreateCollection).toHaveBeenCalledWith('mycoll', {
        vectors: { size: 384, distance: 'Dot' },
      });
    });
  });

  describe('upsertPoint', () => {
    it('should upsert a single point with id, vector, and payload', async () => {
      await wrapper.upsertPoint({
        id: 'p1',
        vector: [0.1, 0.2],
        payload: { documentId: 'd1', content: 'hello' },
      });
      expect(mockUpsert).toHaveBeenCalledWith('test-collection', {
        points: [{ id: 'p1', vector: [0.1, 0.2], payload: { documentId: 'd1', content: 'hello' } }],
      });
    });
  });

  describe('upsertBatch', () => {
    it('should upsert all points in a single batch when under batch size', async () => {
      const points = [
        { id: 'a', vector: [1], payload: { x: 1 } },
        { id: 'b', vector: [2], payload: { x: 2 } },
      ];
      await wrapper.upsertBatch(points);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith('test-collection', {
        points: [
          { id: 'a', vector: [1], payload: { x: 1 } },
          { id: 'b', vector: [2], payload: { x: 2 } },
        ],
      });
    });

    it('should split into multiple batches of 100', async () => {
      const points = Array.from({ length: 250 }, (_, i) => ({
        id: `p${i}`,
        vector: [i],
        payload: {},
      }));
      await wrapper.upsertBatch(points);
      expect(mockUpsert).toHaveBeenCalledTimes(3);
      const callSizes = mockUpsert.mock.calls.map((c) => c[1].points.length);
      expect(callSizes).toEqual([100, 100, 50]);
    });

    it('should not call upsert for an empty batch', async () => {
      await wrapper.upsertBatch([]);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should map results to RetrievalResult and pass options', async () => {
      mockSearch.mockResolvedValue([
        {
          id: 'c1',
          score: 0.9,
          payload: { documentId: 'd1', content: 'text', extra: true },
        },
      ]);
      const results = await wrapper.search({ vector: [0.1, 0.2], topK: 5 });
      expect(mockSearch).toHaveBeenCalledWith('test-collection', {
        vector: [0.1, 0.2],
        limit: 5,
        with_payload: true,
        filter: undefined,
      });
      expect(results).toEqual([
        {
          chunkId: 'c1',
          documentId: 'd1',
          content: 'text',
          score: 0.9,
          source: 'vector',
          metadata: { documentId: 'd1', content: 'text', extra: true },
        },
      ]);
    });

    it('should default missing payload fields to empty strings/object', async () => {
      mockSearch.mockResolvedValue([{ id: 'c2', score: 0.5, payload: undefined }]);
      const results = await wrapper.search({ vector: [0.3], topK: 1 });
      expect(results[0]).toEqual({
        chunkId: 'c2',
        documentId: '',
        content: '',
        score: 0.5,
        source: 'vector',
        metadata: {},
      });
    });

    it('should build and pass a filter when provided', async () => {
      mockSearch.mockResolvedValue([]);
      await wrapper.search({
        vector: [0.1],
        topK: 3,
        filter: { category: { $eq: 'news' } },
      });
      const passedFilter = mockSearch.mock.calls[0][1].filter;
      expect(passedFilter).toEqual({ must: [{ key: 'category', match: { value: 'news' } }] });
    });
  });

  describe('buildStandardFilter', () => {
    it('should handle implicit equality (primitive value)', () => {
      expect(wrapper.buildStandardFilter({ status: 'active' })).toEqual({
        must: [{ key: 'status', match: { value: 'active' } }],
      });
    });

    it('should handle $eq', () => {
      expect(wrapper.buildStandardFilter({ a: { $eq: 1 } })).toEqual({
        must: [{ key: 'a', match: { value: 1 } }],
      });
    });

    it('should handle $ne via must_not', () => {
      expect(wrapper.buildStandardFilter({ a: { $ne: 1 } })).toEqual({
        must_not: [{ key: 'a', match: { value: 1 } }],
      });
    });

    it('should handle $in via match.any', () => {
      expect(wrapper.buildStandardFilter({ a: { $in: [1, 2] } })).toEqual({
        must: [{ key: 'a', match: { any: [1, 2] } }],
      });
    });

    it('should handle $nin via must_not match.any', () => {
      expect(wrapper.buildStandardFilter({ a: { $nin: [1, 2] } })).toEqual({
        must_not: [{ key: 'a', match: { any: [1, 2] } }],
      });
    });

    it('should handle $gt / $gte / $lt / $lte as a combined range', () => {
      // A single operator object combining all range bounds is not part of the
      // StandardFilterOperator union, but the wrapper supports it at runtime.
      expect(
        wrapper.buildStandardFilter({
          n: { $gt: 1, $gte: 2, $lt: 10, $lte: 9 } as unknown as { $gt: number },
        }),
      ).toEqual({
        must: [{ key: 'n', range: { gt: 1, gte: 2, lt: 10, lte: 9 } }],
      });
    });

    it('should handle a single range operator', () => {
      expect(wrapper.buildStandardFilter({ n: { $gt: 5 } })).toEqual({
        must: [{ key: 'n', range: { gt: 5 } }],
      });
    });

    it('should handle $exists true', () => {
      expect(wrapper.buildStandardFilter({ f: { $exists: true } })).toEqual({
        must: [{ key: 'f', values_count: { gt: 0 } }],
      });
    });

    it('should handle $exists false via must_not', () => {
      expect(wrapper.buildStandardFilter({ f: { $exists: false } })).toEqual({
        must_not: [{ key: 'f', values_count: { gt: 0 } }],
      });
    });

    it('should handle an array value as an implicit equality match', () => {
      expect(wrapper.buildStandardFilter({ tags: ['x', 'y'] })).toEqual({
        must: [{ key: 'tags', match: { value: ['x', 'y'] } }],
      });
    });

    it('should handle a null value as an implicit equality match', () => {
      expect(wrapper.buildStandardFilter({ k: null })).toEqual({
        must: [{ key: 'k', match: { value: null } }],
      });
    });

    it('should combine multiple keys into must / must_not', () => {
      expect(wrapper.buildStandardFilter({ a: { $eq: 1 }, b: { $ne: 2 } })).toEqual({
        must: [{ key: 'a', match: { value: 1 } }],
        must_not: [{ key: 'b', match: { value: 2 } }],
      });
    });

    it('should handle $and combining must and must_not from children', () => {
      const result = wrapper.buildStandardFilter({
        $and: [{ a: { $eq: 1 } }, { b: { $ne: 2 } }, { c: { $gt: 3 } }],
      });
      expect(result).toEqual({
        must: [
          { key: 'a', match: { value: 1 } },
          { key: 'c', range: { gt: 3 } },
        ],
        must_not: [{ key: 'b', match: { value: 2 } }],
      });
    });

    it('should handle $and where a child produces no conditions', () => {
      const result = wrapper.buildStandardFilter({ $and: [{}] });
      expect(result).toEqual({});
    });

    it('should handle $or via should with nested filters', () => {
      const result = wrapper.buildStandardFilter({
        $or: [{ a: { $eq: 1 } }, { b: { $eq: 2 } }],
      });
      expect(result).toEqual({
        should: [
          { filter: { must: [{ key: 'a', match: { value: 1 } }] } },
          { filter: { must: [{ key: 'b', match: { value: 2 } }] } },
        ],
      });
    });

    it('should handle nested $and inside $or', () => {
      const result = wrapper.buildStandardFilter({
        $or: [{ $and: [{ a: { $eq: 1 } }, { b: { $ne: 2 } }] }, { c: { $eq: 3 } }],
      });
      expect(result).toEqual({
        should: [
          {
            filter: {
              must: [{ key: 'a', match: { value: 1 } }],
              must_not: [{ key: 'b', match: { value: 2 } }],
            },
          },
          { filter: { must: [{ key: 'c', match: { value: 3 } }] } },
        ],
      });
    });

    it('should ignore unknown operators (no matching branch)', () => {
      const result = wrapper.buildStandardFilter({
        a: { $weird: 1 } as unknown as { $eq: string },
      });
      expect(result).toEqual({});
    });
  });

  describe('deleteCollection', () => {
    it('should call the delete API with the collection name', async () => {
      await wrapper.deleteCollection('to-delete');
      expect(mockDeleteCollection).toHaveBeenCalledWith('to-delete');
    });
  });

  describe('getCollectionInfo', () => {
    it('should map collection info to VectorStoreStats', async () => {
      mockGetCollection.mockResolvedValue({
        points_count: 42,
        config: { params: { vectors: { size: 768, distance: 'Cosine' } } },
      });
      const info = await wrapper.getCollectionInfo('test-collection');
      expect(info).toEqual({
        collectionName: 'test-collection',
        vectorCount: 42,
        vectorDimension: 768,
      });
    });

    it('should fall back to config vectorSize when vectors info has no size', async () => {
      mockGetCollection.mockResolvedValue({
        points_count: 7,
        config: { params: {} },
      });
      const info = await wrapper.getCollectionInfo('test-collection');
      expect(info).toEqual({
        collectionName: 'test-collection',
        vectorCount: 7,
        vectorDimension: 1536,
      });
    });

    it('should default vectorCount to 0 when points_count is missing', async () => {
      mockGetCollection.mockResolvedValue({ config: { params: { vectors: { size: 100 } } } });
      const info = await wrapper.getCollectionInfo('test-collection');
      expect(info).toEqual({
        collectionName: 'test-collection',
        vectorCount: 0,
        vectorDimension: 100,
      });
    });

    it('should return null when the API throws', async () => {
      mockGetCollection.mockRejectedValue(new Error('nope'));
      expect(await wrapper.getCollectionInfo('test-collection')).toBeNull();
    });
  });

  describe('listCollections', () => {
    it('should return collection names', async () => {
      mockGetCollections.mockResolvedValue({
        collections: [{ name: 'a' }, { name: 'b' }],
      });
      expect(await wrapper.listCollections()).toEqual(['a', 'b']);
    });
  });

  describe('healthCheck', () => {
    it('should return true when reachable', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });
      expect(await wrapper.healthCheck()).toBe(true);
    });

    it('should return false when the API throws', async () => {
      mockGetCollections.mockRejectedValue(new Error('down'));
      expect(await wrapper.healthCheck()).toBe(false);
    });
  });

  describe('close', () => {
    it('should not throw', async () => {
      await expect(wrapper.close()).resolves.toBeUndefined();
    });
  });

  describe('scanPoints', () => {
    it('should map scroll results to points with defaults', async () => {
      mockScroll.mockResolvedValue({
        points: [
          { id: 'p1', vector: [1, 2], payload: { a: 1 } },
          { id: 'p2', vector: [3, 4], payload: undefined },
        ],
        next_page_offset: 'cursor-2',
      });
      const result = await wrapper.scanPoints('test-collection');
      expect(mockScroll).toHaveBeenCalledWith('test-collection', {
        limit: 100,
        offset: undefined,
        with_payload: true,
        with_vector: true,
      });
      expect(result).toEqual({
        points: [
          { id: 'p1', vector: [1, 2], payload: { a: 1 } },
          { id: 'p2', vector: [3, 4], payload: {} },
        ],
        nextCursor: 'cursor-2',
      });
    });

    it('should pass batchSize and cursor options through', async () => {
      mockScroll.mockResolvedValue({ points: [], next_page_offset: null });
      await wrapper.scanPoints('test-collection', { batchSize: 25, cursor: 'abc' });
      expect(mockScroll).toHaveBeenCalledWith('test-collection', {
        limit: 25,
        offset: 'abc',
        with_payload: true,
        with_vector: true,
      });
    });

    it('should return undefined nextCursor when there is no next page', async () => {
      mockScroll.mockResolvedValue({ points: [], next_page_offset: null });
      const result = await wrapper.scanPoints('test-collection');
      expect(result.nextCursor).toBeUndefined();
    });

    it('should stringify a numeric next_page_offset', async () => {
      mockScroll.mockResolvedValue({ points: [], next_page_offset: 99 });
      const result = await wrapper.scanPoints('test-collection');
      expect(result.nextCursor).toBe('99');
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElasticsearchClientWrapper } from './elasticsearch-client.js';

const mockSearch = vi.fn();
const mockIndex = vi.fn();
const mockBulk = vi.fn();
const mockIndicesExists = vi.fn();
const mockIndicesCreate = vi.fn();
const mockIndicesDelete = vi.fn();
const mockIndicesGet = vi.fn();
const mockIndicesGetMapping = vi.fn();
const mockScroll = vi.fn();
const mockClearScroll = vi.fn();
const mockPing = vi.fn();
const mockOpenPointInTime = vi.fn();

vi.mock('@elastic/elasticsearch', () => {
  class MockClient {
    search = mockSearch;
    index = mockIndex;
    bulk = mockBulk;
    indices = {
      exists: mockIndicesExists,
      create: mockIndicesCreate,
      delete: mockIndicesDelete,
      get: mockIndicesGet,
      getMapping: mockIndicesGetMapping,
    };
    scroll = mockScroll;
    clearScroll = mockClearScroll;
    ping = mockPing;
    openPointInTime = mockOpenPointInTime;
    close = vi.fn();
  }
  return { Client: MockClient };
});

describe('ElasticsearchClientWrapper', () => {
  const validConfig = {
    node: 'http://localhost:9200',
    indexName: 'test',
    vectorDimension: 1536,
  };

  let adapter: ElasticsearchClientWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ElasticsearchClientWrapper(validConfig);
  });

  describe('constructor', () => {
    it('should set provider to elasticsearch', () => {
      expect(adapter.provider).toBe('elasticsearch');
    });

    it('should expose capabilities with hybrid search and scan', () => {
      expect(adapter.capabilities.supportsHybridSearch).toBe(true);
      expect(adapter.capabilities.supportsScan).toBe(true);
      expect(adapter.capabilities.maxBatchSize).toBe(500);
      expect(adapter.capabilities.maxVectorDimension).toBe(4096);
      expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(true);
      expect(adapter.capabilities.supportsMultiTenancy).toBe(false);
      expect(adapter.capabilities.supportsQuantization).toBe(true);
    });

    it('should expose cost model with zeros', () => {
      expect(adapter.costModel.costPerQueryEstimate).toBe(0);
      expect(adapter.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should create index when it does not exist with apiKey auth', async () => {
      mockIndicesExists.mockResolvedValue(false);
      const adapterWithKey = new ElasticsearchClientWrapper({
        ...validConfig,
        apiKey: 'my-api-key',
      });
      await adapterWithKey.initialize();
      expect(mockIndicesExists).toHaveBeenCalledWith({ index: 'test' });
      expect(mockIndicesCreate).toHaveBeenCalledWith({
        index: 'test',
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              vector: {
                type: 'dense_vector',
                dims: 1536,
                index: true,
                similarity: 'cosine',
              },
              payload: { type: 'object', enabled: true },
              content: { type: 'text' },
            },
          },
        },
      });
    });

    it('should create index when it does not exist with username/password auth', async () => {
      mockIndicesExists.mockResolvedValue(false);
      const adapterWithAuth = new ElasticsearchClientWrapper({
        ...validConfig,
        username: 'user',
        password: 'pass',
      });
      await adapterWithAuth.initialize();
      expect(mockIndicesExists).toHaveBeenCalledWith({ index: 'test' });
      expect(mockIndicesCreate).toHaveBeenCalled();
    });

    it('should skip index creation when index already exists', async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
      expect(mockIndicesCreate).not.toHaveBeenCalled();
    });

    it('should return early if already initialized', async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
      mockIndicesExists.mockClear();
      await adapter.initialize();
      expect(mockIndicesExists).not.toHaveBeenCalled();
    });

    it('should return existing promise if initializing', async () => {
      mockIndicesExists.mockResolvedValue(true);
      const p1 = adapter.initialize();
      const p2 = adapter.initialize();
      await p1;
      await p2;
      expect(mockIndicesExists).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureInitialized', () => {
    it('should throw if not initialized', async () => {
      await expect(adapter.search({ vector: [1], topK: 10 })).rejects.toThrow(
        'ElasticsearchClientWrapper not initialized',
      );
      await expect(adapter.upsertPoint({ id: '1', vector: [1], payload: {} })).rejects.toThrow(
        'ElasticsearchClientWrapper not initialized',
      );
      await expect(adapter.upsertBatch([{ id: '1', vector: [1], payload: {} }])).rejects.toThrow(
        'ElasticsearchClientWrapper not initialized',
      );
      await expect(adapter.deleteCollection('test')).rejects.toThrow(
        'ElasticsearchClientWrapper not initialized',
      );
      await expect(adapter.scanPoints('test')).rejects.toThrow(
        'ElasticsearchClientWrapper not initialized',
      );
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should perform vector search and map hits', async () => {
      mockSearch.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'hit-1',
              _source: { id: 'chunk-1', payload: { documentId: 'doc-1', content: 'text1' } },
              _score: 0.95,
            },
          ],
        },
      });

      const results = await adapter.search({ vector: [0.1, 0.2], topK: 10 });
      expect(mockSearch).toHaveBeenCalledWith({
        index: 'test',
        body: {
          knn: {
            field: 'vector',
            query_vector: [0.1, 0.2],
            k: 10,
            num_candidates: 20,
          },
          size: 10,
          _source: ['id', 'payload', 'content'],
        },
      });
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        content: 'text1',
        score: 0.95,
        source: 'vector',
        metadata: { documentId: 'doc-1', content: 'text1' },
      });
    });

    it('should handle empty search results', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      const results = await adapter.search({ vector: [0.1, 0.2], topK: 10 });
      expect(results).toEqual([]);
    });

    it('should handle missing hits property', async () => {
      mockSearch.mockResolvedValue({});
      const results = await adapter.search({ vector: [0.1, 0.2], topK: 10 });
      expect(results).toEqual([]);
    });

    it('should apply filter to knn query', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1, 0.2],
        topK: 10,
        filter: { status: 'active' },
      });
      expect(mockSearch).toHaveBeenCalledWith({
        index: 'test',
        body: {
          knn: {
            field: 'vector',
            query_vector: [0.1, 0.2],
            k: 10,
            num_candidates: 20,
            filter: { bool: { must: [{ term: { 'payload.status': 'active' } }] } },
          },
          size: 10,
          _source: ['id', 'payload', 'content'],
        },
      });
    });

    it('should perform hybrid search with match query and knn', async () => {
      mockSearch.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'hit-1',
              _source: { id: 'chunk-1', payload: { documentId: 'doc-1', content: 'text1' } },
              _score: 0.92,
            },
          ],
        },
      });

      const results = await adapter.search({
        vector: [0.1, 0.2],
        topK: 10,
        hybridQuery: 'search text',
      });

      expect(mockSearch).toHaveBeenCalledWith({
        index: 'test',
        body: {
          query: {
            bool: {
              should: [{ match: { content: 'search text' } }],
            },
          },
          knn: {
            field: 'vector',
            query_vector: [0.1, 0.2],
            k: 10,
            num_candidates: 20,
          },
          size: 10,
          _source: ['id', 'payload'],
        },
      });
      expect(results[0].source).toBe('hybrid-native');
    });

    it('should apply filter to hybrid search', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1, 0.2],
        topK: 10,
        hybridQuery: 'search text',
        filter: { status: 'active' },
      });
      const callBody = mockSearch.mock.calls[0][0].body;
      expect(callBody.query.bool.filter).toEqual({
        bool: { must: [{ term: { 'payload.status': 'active' } }] },
      });
    });

    it('should use fallback id when _source.id is missing', async () => {
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _id: 'direct-id', _source: { payload: {} }, _score: 0.5 }],
        },
      });
      const results = await adapter.search({ vector: [0.1, 0.2], topK: 10 });
      expect(results[0].chunkId).toBe('direct-id');
    });

    it('should use fallback values when hybrid search hit has no _source', async () => {
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _id: 'no-source-id', _score: null }],
        },
      });
      const results = await adapter.search({
        vector: [0.1],
        topK: 10,
        hybridQuery: 'test',
      });
      expect(results[0]).toEqual({
        chunkId: 'no-source-id',
        documentId: '',
        content: '',
        score: 0,
        source: 'hybrid-native',
        metadata: {},
      });
    });

    it('should use fallback values when vector search hit has no _source', async () => {
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _id: 'ns-id' }],
        },
      });
      const results = await adapter.search({ vector: [0.1], topK: 10 });
      expect(results[0]).toEqual({
        chunkId: 'ns-id',
        documentId: '',
        content: '',
        score: 0,
        source: 'vector',
        metadata: {},
      });
    });

    it('should use fallback values when vector search hit has _source without payload', async () => {
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _id: 'h1', _source: {} }],
        },
      });
      const results = await adapter.search({ vector: [0.1], topK: 10 });
      expect(results[0]).toEqual({
        chunkId: 'h1',
        documentId: '',
        content: '',
        score: 0,
        source: 'vector',
        metadata: {},
      });
    });

    it('should use fallback values in hybrid search when _source has no payload', async () => {
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _id: 'h2', _source: {} }],
        },
      });
      const results = await adapter.search({
        vector: [0.1],
        topK: 10,
        hybridQuery: 'test',
      });
      expect(results[0]).toEqual({
        chunkId: 'h2',
        documentId: '',
        content: '',
        score: 0,
        source: 'hybrid-native',
        metadata: {},
      });
    });
  });

  describe('buildESFilter', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should handle $eq operator', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $eq: 'value' } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({ bool: { must: [{ term: { 'payload.field': 'value' } }] } });
    });

    it('should handle $ne operator', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $ne: 'exclude' } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({
        bool: { must: [{ bool: { must_not: { term: { 'payload.field': 'exclude' } } } }] },
      });
    });

    it('should handle $in operator', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $in: ['a', 'b'] } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({ bool: { must: [{ terms: { 'payload.field': ['a', 'b'] } }] } });
    });

    it('should handle $nin operator', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $nin: ['x', 'y'] } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({
        bool: {
          must: [{ bool: { must_not: { terms: { 'payload.field': ['x', 'y'] } } } }],
        },
      });
    });

    it('should handle $gt operator', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $gt: 5 } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({ bool: { must: [{ range: { 'payload.field': { gt: 5 } } }] } });
    });

    it('should handle $gte operator', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $gte: 10 } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({ bool: { must: [{ range: { 'payload.field': { gte: 10 } } }] } });
    });

    it('should handle $lt operator', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $lt: 100 } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({ bool: { must: [{ range: { 'payload.field': { lt: 100 } } }] } });
    });

    it('should handle $lte operator', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $lte: 50 } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({ bool: { must: [{ range: { 'payload.field': { lte: 50 } } }] } });
    });

    it('should handle $exists: true', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $exists: true } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({
        bool: { must: [{ exists: { field: 'payload.field' } }] },
      });
    });

    it('should handle $exists: false', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: { $exists: false } },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({
        bool: { must: [{ bool: { must_not: { exists: { field: 'payload.field' } } } }] },
      });
    });

    it('should handle null value as must_not exists', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { field: null },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({
        bool: { must: [{ bool: { must_not: { exists: { field: 'payload.field' } } } }] },
      });
    });

    it('should handle direct value as term query', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { status: 'active' },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({
        bool: { must: [{ term: { 'payload.status': 'active' } }] },
      });
    });

    it('should handle $and logical filter', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { $and: [{ status: 'active' }, { age: { $gt: 18 } }] },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({
        bool: {
          must: [
            { bool: { must: [{ term: { 'payload.status': 'active' } }] } },
            { bool: { must: [{ range: { 'payload.age': { gt: 18 } } }] } },
          ],
        },
      });
    });

    it('should handle $or logical filter', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      await adapter.search({
        vector: [0.1],
        topK: 10,
        filter: { $or: [{ role: 'admin' }, { role: 'moderator' }] },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      expect(filter).toEqual({
        bool: {
          should: [
            { bool: { must: [{ term: { 'payload.role': 'admin' } }] } },
            { bool: { must: [{ term: { 'payload.role': 'moderator' } }] } },
          ],
          minimum_should_match: 1,
        },
      });
    });
  });

  describe('upsertPoint', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should index document with correct format', async () => {
      mockIndex.mockResolvedValue({});
      await adapter.upsertPoint({
        id: 'point-1',
        vector: [0.1, 0.2],
        payload: { documentId: 'doc-1', content: 'some content' },
      });
      expect(mockIndex).toHaveBeenCalledWith({
        index: 'test',
        id: 'point-1',
        body: {
          id: 'point-1',
          vector: [0.1, 0.2],
          payload: { documentId: 'doc-1', content: 'some content' },
          content: 'some content',
        },
      });
    });

    it('should handle empty payload', async () => {
      mockIndex.mockResolvedValue({});
      await adapter.upsertPoint({ id: 'point-2', vector: [0.3], payload: {} });
      expect(mockIndex).toHaveBeenCalledWith({
        index: 'test',
        id: 'point-2',
        body: {
          id: 'point-2',
          vector: [0.3],
          payload: {},
          content: '',
        },
      });
    });
  });

  describe('upsertBatch', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should bulk index points with correct format', async () => {
      mockBulk.mockResolvedValue({});
      await adapter.upsertBatch([
        { id: 'p1', vector: [0.1], payload: { content: 'a' } },
        { id: 'p2', vector: [0.2], payload: { content: 'b' } },
      ]);
      expect(mockBulk).toHaveBeenCalledWith({
        body: [
          { index: { _index: 'test', _id: 'p1' } },
          { id: 'p1', vector: [0.1], payload: { content: 'a' }, content: 'a' },
          { index: { _index: 'test', _id: 'p2' } },
          { id: 'p2', vector: [0.2], payload: { content: 'b' }, content: 'b' },
        ],
      });
    });

    it('should batch in chunks of maxBatchSize', async () => {
      mockBulk.mockResolvedValue({});
      const points = Array.from({ length: 600 }, (_, i) => ({
        id: `p${i}`,
        vector: [i],
        payload: { content: `c${i}` },
      }));
      await adapter.upsertBatch(points);
      expect(mockBulk).toHaveBeenCalledTimes(2);
      const firstCallBody = mockBulk.mock.calls[0][0].body;
      expect(firstCallBody).toHaveLength(1000);
      const secondCallBody = mockBulk.mock.calls[1][0].body;
      expect(secondCallBody).toHaveLength(200);
    });

    it('should use fallback content when payload has no content field', async () => {
      mockBulk.mockResolvedValue({});
      await adapter.upsertBatch([{ id: 'p1', vector: [0.1], payload: { otherField: 'val' } }]);
      const ops = mockBulk.mock.calls[0][0].body;
      expect(ops[1].content).toBe('');
    });
  });

  describe('deleteCollection', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should delete index by name', async () => {
      mockIndicesDelete.mockResolvedValue({});
      await adapter.deleteCollection('my-index');
      expect(mockIndicesDelete).toHaveBeenCalledWith({ index: 'my-index' });
    });
  });

  describe('getCollectionInfo', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should return stats when index exists', async () => {
      mockIndicesGet.mockResolvedValue({ test: {} });
      const countMock = vi.fn().mockResolvedValue({ count: 42 });
      (adapter as any).client.count = countMock;

      const stats = await adapter.getCollectionInfo('test');
      expect(mockIndicesGet).toHaveBeenCalledWith({ index: 'test' });
      expect(countMock).toHaveBeenCalledWith({ index: 'test' });
      expect(stats).toEqual({
        collectionName: 'test',
        vectorCount: 42,
        vectorDimension: 1536,
      });
    });

    it('should use fallback count when count is undefined', async () => {
      mockIndicesGet.mockResolvedValue({ test: {} });
      const countMock = vi.fn().mockResolvedValue({});
      (adapter as any).client.count = countMock;
      const stats = await adapter.getCollectionInfo('test');
      expect(stats?.vectorCount).toBe(0);
    });

    it('should return null when index does not exist', async () => {
      mockIndicesGet.mockRejectedValue(new Error('not found'));
      const stats = await adapter.getCollectionInfo('nonexistent');
      expect(stats).toBeNull();
    });
  });

  describe('listCollections', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should return list of index names', async () => {
      mockIndicesGet.mockResolvedValue({ index1: {}, index2: {} });
      const names = await adapter.listCollections();
      expect(names).toEqual(['index1', 'index2']);
    });

    it('should return empty array on error', async () => {
      mockIndicesGet.mockRejectedValue(new Error('error'));
      const names = await adapter.listCollections();
      expect(names).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should return true when ping succeeds', async () => {
      mockPing.mockResolvedValue(true);
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when ping fails', async () => {
      mockPing.mockRejectedValue(new Error('timeout'));
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should close the client when initialized', async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
      const client = (adapter as any).client;
      await adapter.close();
      expect(client.close).toHaveBeenCalled();
    });

    it('should do nothing when not initialized', async () => {
      await adapter.close();
    });
  });

  describe('scanPoints', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should scan with match_all and return points with nextCursor', async () => {
      const hits = Array.from({ length: 100 }, (_, i) => ({
        _id: `hit-${i}`,
        _source: { id: `p${i}`, vector: [i / 100], payload: { idx: i } },
      }));
      mockSearch.mockResolvedValue({
        hits: { hits },
        _scroll_id: 'scroll-123',
      });

      const result = await adapter.scanPoints('test', { batchSize: 100 });
      expect(mockSearch).toHaveBeenCalledWith({
        index: 'test',
        body: {
          query: { match_all: {} },
          size: 100,
          _source: ['id', 'vector', 'payload'],
        },
        scroll: '1m',
      });
      expect(result.points).toHaveLength(100);
      expect(result.points[0]).toEqual({ id: 'p0', vector: [0], payload: { idx: 0 } });
      expect(result.nextCursor).toBe('scroll-123');
    });

    it('should use default batch size of 100', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] }, _scroll_id: 's1' });
      const _result = await adapter.scanPoints('test');
      expect(mockSearch.mock.calls[0][0].body.size).toBe(100);
    });

    it('should not include nextCursor when fewer hits than batch size', async () => {
      mockSearch.mockResolvedValue({
        hits: { hits: [{ _id: '1', _source: { id: 'p1', vector: [0.1], payload: {} } }] },
        _scroll_id: 'scroll-end',
      });
      const result = await adapter.scanPoints('test', { batchSize: 100 });
      expect(result.nextCursor).toBeUndefined();
    });

    it('should scroll with cursor when provided', async () => {
      const scrollHits = Array.from({ length: 50 }, (_, i) => ({
        _id: `hit-scroll-${i}`,
        _source: { id: `ps${i}`, vector: [i], payload: {} },
      }));
      mockScroll.mockResolvedValue({
        hits: { hits: scrollHits },
        _scroll_id: 'scroll-456',
      });

      const result = await adapter.scanPoints('test', { cursor: 'scroll-123', batchSize: 50 });
      expect(mockScroll).toHaveBeenCalledWith({
        scroll_id: 'scroll-123',
        scroll: '1m',
      });
      expect(result.points).toHaveLength(50);
      expect(result.nextCursor).toBe('scroll-456');
    });

    it('should handle scroll hits equal to batch size', async () => {
      const hits = Array.from({ length: 50 }, (_, i) => ({
        _id: `hit-${i}`,
        _source: { id: `p${i}`, vector: [i], payload: {} },
      }));
      mockScroll.mockResolvedValue({ hits: { hits }, _scroll_id: 'scroll-next' });

      const result = await adapter.scanPoints('test', { cursor: 'scroll-123', batchSize: 50 });
      expect(result.nextCursor).toBe('scroll-next');
    });

    it('should handle empty hits in scroll', async () => {
      mockScroll.mockResolvedValue({ hits: { hits: [] }, _scroll_id: 'scroll-last' });

      const result = await adapter.scanPoints('test', { cursor: 'scroll-123', batchSize: 100 });
      expect(result.points).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should use fallback values when scan hit has no _source', async () => {
      mockSearch.mockResolvedValue({
        hits: {
          hits: [{ _id: 'no-src' }],
        },
        _scroll_id: 's1',
      });
      const result = await adapter.scanPoints('test', { batchSize: 1 });
      expect(result.points[0]).toEqual({ id: 'no-src', vector: [], payload: {} });
    });

    it('should use empty array fallback when main scan result has no hits.hits', async () => {
      mockSearch.mockResolvedValue({ hits: {} });
      const result = await adapter.scanPoints('test');
      expect(result.points).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should use empty string id when scan hit has neither _source.id nor _id', async () => {
      mockSearch.mockResolvedValue({
        hits: { hits: [{}] },
        _scroll_id: 's2',
      });
      const result = await adapter.scanPoints('test', { batchSize: 1 });
      expect(result.points[0].id).toBe('');
      expect(result.points[0].vector).toEqual([]);
      expect(result.points[0].payload).toEqual({});
    });

    it('should use empty array fallback when scroll result has no hits.hits', async () => {
      mockScroll.mockResolvedValue({ hits: {} });
      const result = await adapter.scanPoints('test', { cursor: 'scroll-abc', batchSize: 100 });
      expect(result.points).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should use empty string id when scroll hit has neither _source.id nor _id', async () => {
      mockScroll.mockResolvedValue({
        hits: { hits: [{}] },
        _scroll_id: 'scroll-xyz',
      });
      const result = await adapter.scanPoints('test', { cursor: 'scroll-abc', batchSize: 1 });
      expect(result.points[0].id).toBe('');
    });

    it('should fall back to _id when scroll hit has _source without id field', async () => {
      mockScroll.mockResolvedValue({
        hits: { hits: [{ _id: 'fallback-id', _source: { vector: [0.5], payload: { x: 1 } } }] },
        _scroll_id: 'scroll-xyz2',
      });
      const result = await adapter.scanPoints('test', { cursor: 'scroll-prev', batchSize: 1 });
      expect(result.points[0].id).toBe('fallback-id');
      expect(result.points[0].vector).toEqual([0.5]);
      expect(result.points[0].payload).toEqual({ x: 1 });
    });
  });

  describe('search — additional fallback branches', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should return empty array when hybrid search result has no hits.hits', async () => {
      mockSearch.mockResolvedValue({ hits: {} });
      const results = await adapter.search({
        vector: [0.1],
        topK: 10,
        hybridQuery: 'test query',
      });
      expect(results).toEqual([]);
    });

    it('should use empty string id when hybrid hit has neither _source.id nor _id', async () => {
      mockSearch.mockResolvedValue({
        hits: { hits: [{ _score: 0.5 }] },
      });
      const results = await adapter.search({
        vector: [0.1],
        topK: 10,
        hybridQuery: 'test',
      });
      expect(results[0].chunkId).toBe('');
    });

    it('should use empty string id when vector search hit has neither _source.id nor _id', async () => {
      mockSearch.mockResolvedValue({
        hits: { hits: [{ _score: 0.5 }] },
      });
      const results = await adapter.search({ vector: [0.1], topK: 10 });
      expect(results[0].chunkId).toBe('');
    });
  });

  describe('buildESFilter — edge cases', () => {
    beforeEach(async () => {
      mockIndicesExists.mockResolvedValue(true);
      await adapter.initialize();
    });

    it('should ignore unrecognized operator objects silently (no clause added)', async () => {
      mockSearch.mockResolvedValue({ hits: { hits: [] } });
      // Pass an object value with no recognized operator key — exercises the
      // else-if chain fallthrough where $lte check is false and no clause is added
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $unknown: 'value' } as any },
      });
      const filter = mockSearch.mock.calls[0][0].body.knn.filter;
      // None of the operators matched, so must array is empty
      expect(filter).toEqual({ bool: { must: [] } });
    });
  });
});

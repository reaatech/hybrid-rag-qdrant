import type { StandardFilter, VectorStorePoint } from '@reaatech/hybrid-rag';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureAISearchClientWrapper } from './azure-ai-search-client.js';

const mockGetIndex = vi.fn();
const mockCreateIndex = vi.fn();
const mockDeleteIndex = vi.fn();
const mockListIndexes = vi.fn();
const mockSearch = vi.fn();
const mockMergeOrUploadDocuments = vi.fn();
const mockGetDocumentCount = vi.fn();
const mockGetIndexStatistics = vi.fn();

vi.mock('@azure/search-documents', () => ({
  AzureKeyCredential: class {
    constructor(public key: string) {}
  },
  SearchClient: class {
    constructor(
      public endpoint: string,
      public indexName: string,
      public credential: { key: string },
    ) {}
    search = mockSearch;
    mergeOrUploadDocuments = mockMergeOrUploadDocuments;
    getDocumentCount = mockGetDocumentCount;
  },
  SearchIndexClient: class {
    constructor(
      public endpoint: string,
      public credential: { key: string },
    ) {}
    getIndex = mockGetIndex;
    createIndex = mockCreateIndex;
    deleteIndex = mockDeleteIndex;
    listIndexes = mockListIndexes;
    getIndexStatistics = mockGetIndexStatistics;
  },
}));

async function* makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe('AzureAISearchClientWrapper', () => {
  const validConfig = {
    endpoint: 'https://test.search.windows.net',
    apiKey: 'test-key',
    indexName: 'test',
    vectorDimension: 1536,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should accept a valid config', () => {
      const adapter = new AzureAISearchClientWrapper(validConfig);
      expect(adapter.provider).toBe('azure-ai-search');
    });

    it('should expose correct capabilities', () => {
      const adapter = new AzureAISearchClientWrapper(validConfig);
      expect(adapter.capabilities.supportsHybridSearch).toBe(true);
      expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(true);
      expect(adapter.capabilities.supportsScan).toBe(true);
      expect(adapter.capabilities.maxBatchSize).toBe(1000);
    });

    it('should expose cost model', () => {
      const adapter = new AzureAISearchClientWrapper(validConfig);
      expect(adapter.costModel.costPerQueryEstimate).toBe(0);
      expect(adapter.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should create index if it does not exist', async () => {
      mockGetIndex.mockRejectedValueOnce(new Error('not found'));
      mockCreateIndex.mockResolvedValueOnce(undefined);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();

      expect(mockGetIndex).toHaveBeenCalledWith('test');
      expect(mockCreateIndex).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test',
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'id', type: 'Edm.String', key: true }),
            expect.objectContaining({
              name: 'vector',
              type: 'Collection(Edm.Single)',
              dimensions: 1536,
            }),
            expect.objectContaining({ name: 'payload', type: 'Edm.String' }),
            expect.objectContaining({ name: 'content', type: 'Edm.String' }),
          ]),
          vectorSearch: expect.objectContaining({
            algorithms: expect.arrayContaining([
              expect.objectContaining({ name: 'hnsw-config', kind: 'hnsw' }),
            ]),
            profiles: expect.arrayContaining([
              expect.objectContaining({
                name: 'vector-profile',
                algorithmConfigurationName: 'hnsw-config',
              }),
            ]),
          }),
        }),
      );
    });

    it('should not create index if it already exists', async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();

      expect(mockGetIndex).toHaveBeenCalledWith('test');
      expect(mockCreateIndex).not.toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      mockGetIndex.mockClear();

      await adapter.initialize();
      expect(mockGetIndex).not.toHaveBeenCalled();
    });

    it('should return existing promise if init is in progress', async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });

      const adapter = new AzureAISearchClientWrapper(validConfig);
      const p1 = adapter.initialize();
      const p2 = adapter.initialize();
      await p1;
      await p2;

      expect(mockGetIndex).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureInitialized', () => {
    it('should throw if search called before initialize', async () => {
      const adapter = new AzureAISearchClientWrapper(validConfig);
      await expect(adapter.search({ vector: [1, 2, 3], topK: 10 })).rejects.toThrow(
        'not initialized',
      );
    });

    it('should throw if upsert called before initialize', async () => {
      const adapter = new AzureAISearchClientWrapper(validConfig);
      await expect(
        adapter.upsertPoint({ id: '1', vector: [1, 2, 3], payload: {} }),
      ).rejects.toThrow('not initialized');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
    });

    it('should perform vector search', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          {
            document: { id: '1', payload: '{"documentId":"doc1","content":"hello"}' },
            score: 0.95,
          },
          {
            document: { id: '2', payload: '{"documentId":"doc2","content":"world"}' },
            score: 0.85,
          },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [0.1, 0.2, 0.3], topK: 10 });

      expect(mockSearch).toHaveBeenCalledWith('*', expect.objectContaining({ top: 10 }));
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        chunkId: '1',
        documentId: 'doc1',
        content: 'hello',
        score: 0.95,
        source: 'vector',
        metadata: { documentId: 'doc1', content: 'hello' },
      });
    });

    it('should perform hybrid search', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          { document: { id: '1', payload: '{"documentId":"doc1"}' }, score: 0.9 },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({
        vector: [0.1, 0.2, 0.3],
        topK: 10,
        hybridQuery: 'test query',
      });

      expect(mockSearch).toHaveBeenCalledWith('test query', expect.objectContaining({ top: 10 }));
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('hybrid-native');
    });

    it('should include filter in search options', async () => {
      const searchResults = { results: makeAsyncIterable([]) };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.search({
        vector: [0.1, 0.2, 0.3],
        topK: 5,
        filter: { status: { $eq: 'active' } },
      });

      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: "payload/status eq 'active'" }),
      );
    });

    it('should handle string payload parse errors', async () => {
      const searchResults = {
        results: makeAsyncIterable([{ document: { id: '1', payload: 'not-json' }, score: 0.9 }]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [0.1, 0.2, 0.3], topK: 10 });

      expect(results[0].metadata).toEqual({ _raw: 'not-json' });
    });

    it('should handle non-string payload as record', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          { document: { id: '1', payload: { documentId: 'doc1', content: 'hi' } }, score: 0.9 },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [0.1, 0.2, 0.3], topK: 10 });

      expect(results[0].metadata).toEqual({ documentId: 'doc1', content: 'hi' });
    });

    it('should handle null payload', async () => {
      const searchResults = {
        results: makeAsyncIterable([{ document: { id: '1', payload: null }, score: 0.9 }]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [0.1, 0.2, 0.3], topK: 10 });

      expect(results[0].metadata).toEqual({});
    });

    it('should handle missing documentId in payload', async () => {
      const searchResults = {
        results: makeAsyncIterable([{ document: { id: '1', payload: '{}' }, score: 0.9 }]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [0.1, 0.2, 0.3], topK: 10 });

      expect(results[0].documentId).toBe('');
    });

    it('should handle missing content in vector search payload', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          { document: { id: '1', payload: '{"documentId":"doc1"}' }, score: 0.9 },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({ vector: [0.1, 0.2, 0.3], topK: 10 });

      expect(results[0].content).toBe('');
    });

    it('should handle missing documentId in hybrid search payload', async () => {
      const searchResults = {
        results: makeAsyncIterable([{ document: { id: '1', payload: '{}' }, score: 0.9 }]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({
        vector: [0.1],
        topK: 10,
        hybridQuery: 'query',
      });

      expect(results[0].documentId).toBe('');
    });

    it('should handle missing content in hybrid search payload', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          { document: { id: '1', payload: '{"documentId":"doc1"}' }, score: 0.9 },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const results = await adapter.search({
        vector: [0.1],
        topK: 10,
        hybridQuery: 'query',
      });

      expect(results[0].content).toBe('');
    });
  });

  describe('upsertPoint', () => {
    beforeEach(async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
    });

    it('should call mergeOrUploadDocuments with point data', async () => {
      mockMergeOrUploadDocuments.mockResolvedValueOnce(undefined);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.upsertPoint({
        id: 'point1',
        vector: [0.1, 0.2, 0.3],
        payload: { documentId: 'doc1', content: 'text', extra: 'data' },
      });

      expect(mockMergeOrUploadDocuments).toHaveBeenCalledWith([
        {
          id: 'point1',
          vector: [0.1, 0.2, 0.3],
          payload: { documentId: 'doc1', content: 'text', extra: 'data' },
          content: 'text',
        },
      ]);
    });

    it('should handle missing content in payload', async () => {
      mockMergeOrUploadDocuments.mockResolvedValueOnce(undefined);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.upsertPoint({
        id: 'p1',
        vector: [0.1],
        payload: { documentId: 'd1' },
      });

      expect(mockMergeOrUploadDocuments).toHaveBeenCalledWith([
        { id: 'p1', vector: [0.1], payload: { documentId: 'd1' }, content: '' },
      ]);
    });
  });

  describe('upsertBatch', () => {
    beforeEach(async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
    });

    it('should batch upsert documents', async () => {
      mockMergeOrUploadDocuments.mockResolvedValue(undefined);

      const points: VectorStorePoint[] = [
        { id: '1', vector: [0.1], payload: { content: 'a', documentId: 'd1' } },
        { id: '2', vector: [0.2], payload: { content: 'b', documentId: 'd2' } },
      ];

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.upsertBatch(points);

      expect(mockMergeOrUploadDocuments).toHaveBeenCalledWith([
        { id: '1', vector: [0.1], payload: { content: 'a', documentId: 'd1' }, content: 'a' },
        { id: '2', vector: [0.2], payload: { content: 'b', documentId: 'd2' }, content: 'b' },
      ]);
    });

    it('should handle batches larger than maxBatchSize', async () => {
      mockMergeOrUploadDocuments.mockResolvedValue(undefined);

      const points: VectorStorePoint[] = [];
      for (let i = 0; i < 2500; i++) {
        points.push({ id: `${i}`, vector: [0.1], payload: { content: `${i}` } });
      }

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.upsertBatch(points);

      expect(mockMergeOrUploadDocuments).toHaveBeenCalledTimes(3);
    });

    it('should handle missing content in batch payloads', async () => {
      mockMergeOrUploadDocuments.mockResolvedValue(undefined);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.upsertBatch([{ id: '1', vector: [0.1], payload: { documentId: 'd1' } }]);

      expect(mockMergeOrUploadDocuments).toHaveBeenCalledWith([
        { id: '1', vector: [0.1], payload: { documentId: 'd1' }, content: '' },
      ]);
    });
  });

  describe('deleteCollection', () => {
    it('should call deleteIndex on indexClient', async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
      mockDeleteIndex.mockResolvedValueOnce(undefined);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      await adapter.deleteCollection('my-index');

      expect(mockDeleteIndex).toHaveBeenCalledWith('my-index');
    });

    it('should not throw if deleteIndex fails', async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
      mockDeleteIndex.mockRejectedValueOnce(new Error('fail'));

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      await expect(adapter.deleteCollection('my-index')).resolves.not.toThrow();
    });
  });

  describe('getCollectionInfo', () => {
    it('should return collection stats', async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' }).mockResolvedValueOnce({ name: 'test' });
      mockGetIndexStatistics.mockResolvedValueOnce({ documentCount: 42 });

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const stats = await adapter.getCollectionInfo('test');

      expect(stats).toEqual({
        collectionName: 'test',
        vectorCount: 42,
        vectorDimension: 1536,
      });
    });

    it('should return null if getIndex fails', async () => {
      mockGetIndex
        .mockResolvedValueOnce({ name: 'test' })
        .mockRejectedValueOnce(new Error('not found'));

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const stats = await adapter.getCollectionInfo('nonexistent');
      expect(stats).toBeNull();
    });
  });

  describe('listCollections', () => {
    beforeEach(async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
    });

    it('should return list of index names', async () => {
      mockListIndexes.mockResolvedValueOnce([{ name: 'idx1' }, { name: 'idx2' }]);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const collections = await adapter.listCollections();

      expect(collections).toEqual(['idx1', 'idx2']);
    });

    it('should return empty array on error', async () => {
      mockListIndexes.mockRejectedValueOnce(new Error('fail'));

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const collections = await adapter.listCollections();

      expect(collections).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true when listIndexes succeeds', async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
      mockListIndexes.mockResolvedValueOnce([]);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const healthy = await adapter.healthCheck();

      expect(healthy).toBe(true);
    });

    it('should return false when listIndexes throws', async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
      mockListIndexes.mockRejectedValueOnce(new Error('fail'));

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const healthy = await adapter.healthCheck();

      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should be a no-op', async () => {
      const adapter = new AzureAISearchClientWrapper(validConfig);
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('scanPoints', () => {
    beforeEach(async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
    });

    it('should scan and return points with cursor', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          { document: { id: '1', vector: [0.1, 0.2], payload: '{"documentId":"d1"}' }, score: 1 },
          { document: { id: '2', vector: [0.3, 0.4], payload: '{"documentId":"d2"}' }, score: 1 },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test', { batchSize: 2 });

      expect(result.points).toHaveLength(2);
      expect(result.points[0]).toEqual({
        id: '1',
        vector: [0.1, 0.2],
        payload: { documentId: 'd1' },
      });
      expect(result.nextCursor).toBe('2');
    });

    it('should return no cursor when fewer results than batch size', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          { document: { id: '1', vector: [0.1], payload: '{}' }, score: 1 },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test', { batchSize: 100 });

      expect(result.points).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should use cursor offset when provided', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          { document: { id: '3', vector: [0.5], payload: '{}' }, score: 1 },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test', { batchSize: 10, cursor: '2' });

      expect(mockSearch).toHaveBeenCalledWith('*', expect.objectContaining({ skip: 2, top: 10 }));
      expect(result.points).toHaveLength(1);
    });

    it('should default batchSize to 100 when no options provided', async () => {
      const searchResults = {
        results: makeAsyncIterable([
          { document: { id: '1', vector: [0.1], payload: '{}' }, score: 1 },
        ]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test');

      expect(mockSearch).toHaveBeenCalledWith('*', expect.objectContaining({ top: 100 }));
      expect(result.points).toHaveLength(1);
    });

    it('should handle document without vector field', async () => {
      const searchResults = {
        results: makeAsyncIterable([{ document: { id: '1', payload: '{}' }, score: 1 }]),
      };
      mockSearch.mockResolvedValueOnce(searchResults);

      const adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
      const result = await adapter.scanPoints('test', { batchSize: 10 });

      expect(result.points[0].vector).toEqual([]);
    });
  });

  describe('buildODATAFilter', () => {
    let adapter: AzureAISearchClientWrapper;

    beforeEach(async () => {
      mockGetIndex.mockResolvedValueOnce({ name: 'test' });
      adapter = new AzureAISearchClientWrapper(validConfig);
      await adapter.initialize();
    });

    it('should handle $eq operator', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $eq: 'value' } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: "payload/field eq 'value'" }),
      );
    });

    it('should handle $ne operator', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $ne: 'value' } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: "payload/field ne 'value'" }),
      );
    });

    it('should handle $in operator', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $in: ['a', 'b', 'c'] } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({
          filter: "(payload/field eq 'a' or payload/field eq 'b' or payload/field eq 'c')",
        }),
      );
    });

    it('should handle $nin operator', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $nin: ['x', 'y'] } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: "(not (payload/field eq 'x' or payload/field eq 'y'))" }),
      );
    });

    it('should handle $gt operator', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $gt: 10 } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field gt 10' }),
      );
    });

    it('should handle $gte operator', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $gte: 10 } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field ge 10' }),
      );
    });

    it('should handle $lt operator', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $lt: 10 } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field lt 10' }),
      );
    });

    it('should handle $lte operator', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $lte: 10 } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field le 10' }),
      );
    });

    it('should handle $exists true', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $exists: true } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field ne null' }),
      );
    });

    it('should handle $exists false', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $exists: false } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field eq null' }),
      );
    });

    it('should handle null value', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: null },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field eq null' }),
      );
    });

    it('should handle direct value (shorthand eq)', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: 'direct' },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: "payload/field eq 'direct'" }),
      );
    });

    it('should handle direct number value', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: 42 },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field eq 42' }),
      );
    });

    it('should handle number $eq value', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $eq: 42 } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field eq 42' }),
      );
    });

    it('should handle $and filter', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: {
          $and: [{ status: { $eq: 'active' } }, { age: { $gt: 18 } }],
        } as StandardFilter,
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: "payload/status eq 'active' and payload/age gt 18" }),
      );
    });

    it('should handle $or filter', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: {
          $or: [{ status: { $eq: 'pending' } }, { status: { $eq: 'active' } }],
        } as StandardFilter,
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({
          filter: "(payload/status eq 'pending' or payload/status eq 'active')",
        }),
      );
    });

    it('should escape single quotes in string values', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $eq: "it's" } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: "payload/field eq 'it''s'" }),
      );
    });

    it('should handle $eq null in operator value', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $eq: null } },
      });
      expect(mockSearch).toHaveBeenCalledWith(
        '*',
        expect.objectContaining({ filter: 'payload/field eq null' }),
      );
    });

    it('should handle unknown operator gracefully', async () => {
      mockSearch.mockResolvedValueOnce({ results: makeAsyncIterable([]) });
      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { unknownOp: 'val' } as any },
      });
      expect(mockSearch).toHaveBeenCalledWith('*', expect.objectContaining({ filter: '' }));
    });
  });
});

import type { StandardFilter, VectorStorePoint } from '@reaatech/hybrid-rag';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VespaClientWrapper } from './vespa-client.js';

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

describe('VespaClientWrapper', () => {
  const validConfig = {
    endpoint: 'http://localhost:8080',
    namespace: 'test',
    documentType: 'doc',
    vectorDimension: 1536,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('ensureInitialized', () => {
    it('should throw if upsertPoint called before initialize', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      expect((adapter as any).initialized).toBe(false);
      expect(() => (adapter as any).ensureInitialized()).toThrow('not initialized');
    });

    it('should throw if search called before initialize', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      expect((adapter as any).initialized).toBe(false);
      await expect(adapter.search({ vector: [1, 2, 3], topK: 10 })).rejects.toThrow(
        'not initialized',
      );
    });

    it('should throw if scanPoints called before initialize', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      expect((adapter as any).initialized).toBe(false);
      await expect(adapter.scanPoints('docs')).rejects.toThrow('not initialized');
    });
  });

  describe('constructor', () => {
    it('should accept a valid config', () => {
      const adapter = new VespaClientWrapper(validConfig);
      expect(adapter.provider).toBe('vespa');
    });

    it('should expose correct capabilities', () => {
      const adapter = new VespaClientWrapper(validConfig);
      expect(adapter.capabilities.supportsHybridSearch).toBe(true);
      expect(adapter.capabilities.supportsScan).toBe(true);
      expect(adapter.capabilities.supportsCollectionManagement).toBe(false);
      expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
      expect(adapter.capabilities.maxBatchSize).toBe(500);
    });

    it('should expose cost model', () => {
      const adapter = new VespaClientWrapper(validConfig);
      expect(adapter.costModel.costPerQueryEstimate).toBe(0);
      expect(adapter.costModel.costPer1000Upserts).toBe(0);
    });

    it('should store apiKey when provided', async () => {
      const adapter = new VespaClientWrapper({ ...validConfig, apiKey: 'my-key' });
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });
      await adapter.search({ vector: [0.1], topK: 5 });
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer my-key');
    });

    it('should not include auth header when apiKey is absent', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });
      await adapter.search({ vector: [0.1], topK: 5 });
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });
  });

  describe('initialize', () => {
    it('should set initialized to true', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      expect((adapter as any).initialized).toBe(false);
      await adapter.initialize();
      expect((adapter as any).initialized).toBe(true);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
    });

    it('should perform vector search with correct YQL', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [
              {
                id: 'id:test:doc::1',
                relevance: 0.95,
                fields: { documentId: 'doc1', content: 'hello world', extra: 'val' },
              },
            ],
          },
        }),
      });

      const results = await adapter.search({ vector: [0.1, 0.2, 0.3], topK: 5 });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toBe(
        'select * from test.doc where ({targetHits: 5}nearestNeighbor(embedding, q)) limit 5',
      );
      expect(callBody['input.query(q)']).toBe('[0.1,0.2,0.3]');
      expect(callBody.query).toBeUndefined();
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        chunkId: 'id:test:doc::1',
        documentId: 'doc1',
        content: 'hello world',
        score: 0.95,
        source: 'vector',
        metadata: { documentId: 'doc1', content: 'hello world', extra: 'val' },
      });
    });

    it('should perform hybrid search with userQuery and query param', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [
              {
                id: 'id:test:doc::1',
                relevance: 0.9,
                fields: { documentId: 'doc1', content: 'result' },
              },
            ],
          },
        }),
      });

      const results = await adapter.search({
        vector: [0.1, 0.2, 0.3],
        topK: 5,
        hybridQuery: 'test query',
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toBe(
        'select * from test.doc where ({targetHits: 5}nearestNeighbor(embedding, q)) or userQuery(@query) limit 5',
      );
      expect(callBody.query).toBe('test query');
      expect(results[0].source).toBe('hybrid-native');
    });

    it('should append filter to YQL when filter is provided', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { status: { $eq: 'active' } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain(" and status = 'active'");
    });

    it('should throw on non-ok response', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(adapter.search({ vector: [0.1], topK: 5 })).rejects.toThrow(
        'Vespa search failed: 400 Bad Request',
      );
    });

    it('should handle empty children array', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results).toEqual([]);
    });

    it('should handle missing root field', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results).toEqual([]);
    });

    it('should handle missing children field', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: {} }),
      });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results).toEqual([]);
    });

    it('should handle child without id in results', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [{ relevance: 0.9, fields: { documentId: 'doc1', content: 'text' } }],
          },
        }),
      });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results[0].chunkId).toBe('');
      expect(results[0].score).toBe(0.9);
    });

    it('should handle child without relevance in results', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [{ id: 'test', fields: { documentId: 'doc1', content: 'text' } }],
          },
        }),
      });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results[0].score).toBe(0);
    });

    it('should handle child without fields in search results', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [{ id: 'test', relevance: 0.9 }],
          },
        }),
      });

      const results = await adapter.search({ vector: [0.1], topK: 5 });
      expect(results[0].documentId).toBe('');
      expect(results[0].metadata).toEqual({});
    });
  });

  describe('upsertPoint', () => {
    it('should POST to document endpoint with correct URL and body', async () => {
      const adapter = new VespaClientWrapper({ ...validConfig, apiKey: 'key' });
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({ ok: true });

      await adapter.upsertPoint({
        id: 'my-point',
        vector: [0.1, 0.2, 0.3],
        payload: { documentId: 'doc1', content: 'text', extra: 'data' },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:8080/document/v1/test/doc/docid/my-point');
      expect(opts.method).toBe('POST');
      expect(opts.headers.Authorization).toBe('Bearer key');
      expect(JSON.parse(opts.body)).toEqual({
        fields: {
          id: 'my-point',
          embedding: [0.1, 0.2, 0.3],
          documentId: 'doc1',
          content: 'text',
          extra: 'data',
        },
      });
    });

    it('should throw on non-ok response', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(adapter.upsertPoint({ id: '1', vector: [0.1], payload: {} })).rejects.toThrow(
        'Vespa upsert failed: 500 Internal Server Error',
      );
    });
  });

  describe('upsertBatch', () => {
    it('should POST each point individually', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValue({ ok: true });

      const points: VectorStorePoint[] = [
        { id: 'p1', vector: [0.1], payload: { documentId: 'd1', content: 'a' } },
        { id: 'p2', vector: [0.2], payload: { documentId: 'd2', content: 'b' } },
      ];

      await adapter.upsertBatch(points);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toContain('/docid/p1');
      expect(mockFetch.mock.calls[1][0]).toContain('/docid/p2');
    });

    it('should throw on failed point upsert', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(
        adapter.upsertBatch([
          { id: 'p1', vector: [0.1], payload: {} },
          { id: 'p2', vector: [0.2], payload: {} },
        ]),
      ).rejects.toThrow('Vespa upsert failed for p2: 400');
    });

    it('should batch with maxBatchSize chunks', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValue({ ok: true });

      const points: VectorStorePoint[] = [];
      for (let i = 0; i < 1200; i++) {
        points.push({ id: `${i}`, vector: [0.1], payload: {} });
      }

      await adapter.upsertBatch(points);
      expect(mockFetch).toHaveBeenCalledTimes(1200);
    });

    it('should include auth header when apiKey is set', async () => {
      const adapter = new VespaClientWrapper({ ...validConfig, apiKey: 'key' });
      await adapter.initialize();
      mockFetch.mockResolvedValue({ ok: true });

      await adapter.upsertBatch([{ id: 'p1', vector: [0.1], payload: {} }]);

      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer key');
    });
  });

  describe('deleteCollection', () => {
    it('should throw because Vespa does not support collection management', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await expect(adapter.deleteCollection('docs')).rejects.toThrow(
        'Vespa does not support collection management',
      );
    });
  });

  describe('getCollectionInfo', () => {
    it('should return stats from totalCount', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: { fields: { totalCount: 42 } },
        }),
      });

      const stats = await adapter.getCollectionInfo('doc');

      expect(stats).toEqual({
        collectionName: 'doc',
        vectorCount: 42,
        vectorDimension: 1536,
      });
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toBe('select * from test.doc where true limit 0');
    });

    it('should return null on non-ok response', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({ ok: false });

      const stats = await adapter.getCollectionInfo('doc');
      expect(stats).toBeNull();
    });

    it('should return null on fetch error', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockRejectedValueOnce(new Error('network error'));

      const stats = await adapter.getCollectionInfo('doc');
      expect(stats).toBeNull();
    });

    it('should include auth header when apiKey is set', async () => {
      const adapter = new VespaClientWrapper({ ...validConfig, apiKey: 'key' });
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { fields: { totalCount: 0 } } }),
      });

      await adapter.getCollectionInfo('doc');
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer key');
    });

    it('should default to 0 when totalCount is missing', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { fields: {} } }),
      });

      const stats = await adapter.getCollectionInfo('doc');
      expect(stats?.vectorCount).toBe(0);
    });
  });

  describe('listCollections', () => {
    it('should return [documentType]', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      const result = await adapter.listCollections();
      expect(result).toEqual(['doc']);
    });
  });

  describe('healthCheck', () => {
    it('should return true when fetch responds ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const adapter = new VespaClientWrapper(validConfig);
      const healthy = await adapter.healthCheck();

      expect(healthy).toBe(true);
    });

    it('should return false when fetch responds not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const adapter = new VespaClientWrapper(validConfig);
      const healthy = await adapter.healthCheck();

      expect(healthy).toBe(false);
    });

    it('should return false when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'));

      const adapter = new VespaClientWrapper(validConfig);
      const healthy = await adapter.healthCheck();

      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should be a no-op', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('scanPoints', () => {
    beforeEach(async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
    });

    it('should scan with select query and map children to points', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [
              {
                id: 'id:test:doc::1',
                relevance: 1,
                fields: {
                  documentId: 'd1',
                  content: 'c1',
                  embedding: [0.1, 0.2],
                  extraField: 'x',
                },
              },
            ],
          },
        }),
      });

      const result = await adapter.scanPoints('doc', { batchSize: 100 });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toBe('select * from test.doc where true limit 100');
      expect(callBody.continuation).toBeUndefined();
      expect(result.points).toHaveLength(1);
      expect(result.points[0]).toEqual({
        id: 'id:test:doc::1',
        vector: [0.1, 0.2],
        payload: {
          documentId: 'd1',
          content: 'c1',
          extraField: 'x',
        },
      });
    });

    it('should handle continuation', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: { children: [] },
          continuation: 'next-token',
        }),
      });

      const result = await adapter.scanPoints('doc', { batchSize: 10, cursor: 'prev-token' });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.continuation).toBe('prev-token');
      expect(result.nextCursor).toBe('next-token');
    });

    it('should use default batchSize of 100', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.scanPoints('doc');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('limit 100');
    });

    it('should throw on non-ok response', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(adapter.scanPoints('doc')).rejects.toThrow('Vespa scan failed: 500');
    });

    it('should include auth header when apiKey is set', async () => {
      const adapter = new VespaClientWrapper({ ...validConfig, apiKey: 'key' });
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.scanPoints('doc');
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer key');
    });

    it('should handle child without id in scan results', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [
              {
                relevance: 1,
                fields: {
                  documentId: 'd1',
                  content: 'c1',
                  embedding: [0.1],
                },
              },
            ],
          },
        }),
      });

      const result = await adapter.scanPoints('doc');
      expect(result.points[0].id).toBe('');
    });

    it('should handle child without fields in scan results', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [{ id: 'test-id' }],
          },
        }),
      });

      const result = await adapter.scanPoints('doc');
      expect(result.points[0].vector).toEqual([]);
      expect(result.points[0].payload).toEqual({ documentId: '', content: '' });
    });

    it('should handle child without embedding in scan results', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          root: {
            children: [
              {
                id: 'test-id',
                fields: { documentId: 'd1', content: 'c1' },
              },
            ],
          },
        }),
      });

      const result = await adapter.scanPoints('doc');
      expect(result.points[0].vector).toEqual([]);
    });
  });

  describe('buildVespaFilter', () => {
    it('should handle $eq operator', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $eq: 'value' } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain("field = 'value'");
    });

    it('should handle $ne operator', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $ne: 'val' } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain("field != 'val'");
    });

    it('should handle $in operator', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $in: ['a', 'b'] } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain("field in ['a','b']");
    });

    it('should handle $nin operator', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $nin: ['x', 'y'] } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain("!(field in ['x','y'])");
    });

    it('should handle $gt operator', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $gt: 10 } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field > 10');
    });

    it('should handle $gte operator', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $gte: 10 } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field >= 10');
    });

    it('should handle $lt operator', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $lt: 10 } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field < 10');
    });

    it('should handle $lte operator', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $lte: 10 } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field <= 10');
    });

    it('should handle $exists true', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $exists: true } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field is not null');
    });

    it('should handle $exists false', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $exists: false } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field is null');
    });

    it('should handle null value', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: null },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field is null');
    });

    it('should handle undefined value', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: undefined as unknown as string },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field is null');
    });

    it('should handle shorthand direct value', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: 'direct' },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain("field = 'direct'");
    });

    it('should handle direct number value', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: 42 },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field = 42');
    });

    it('should handle number $eq value', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $eq: 42 } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field = 42');
    });

    it('should handle boolean value', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: true },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field = true');
    });

    it('should handle $and logical filter', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: {
          $and: [{ status: { $eq: 'active' } }, { age: { $gt: 18 } }],
        } as StandardFilter,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain("status = 'active' AND age > 18");
    });

    it('should handle $or logical filter', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: {
          $or: [{ status: { $eq: 'pending' } }, { status: { $eq: 'active' } }],
        } as StandardFilter,
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain("(status = 'pending' OR status = 'active')");
    });

    it('should escape single quotes in string values', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $eq: "it's" } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain("field = 'it\\'s'");
    });

    it('should handle $eq null in vespa filter', async () => {
      const adapter = new VespaClientWrapper(validConfig);
      await adapter.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ root: { children: [] } }),
      });

      await adapter.search({
        vector: [0.1],
        topK: 5,
        filter: { field: { $eq: null } },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.yql).toContain('field = null');
    });
  });
});

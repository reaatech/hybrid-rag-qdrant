import { beforeEach, describe, expect, it } from 'vitest';
import { SandboxVectorStore } from './sandbox-store.js';

describe('SandboxVectorStore', () => {
  let store: SandboxVectorStore;

  beforeEach(() => {
    store = new SandboxVectorStore({});
  });

  describe('constructor', () => {
    it('should accept empty config', () => {
      expect(store).toBeInstanceOf(SandboxVectorStore);
    });

    it('should accept config with collectionName', () => {
      const s = new SandboxVectorStore({ collectionName: 'test-collection' });
      expect(s).toBeInstanceOf(SandboxVectorStore);
    });
  });

  describe('provider', () => {
    it('should be sandbox', () => {
      expect(store.provider).toBe('sandbox');
    });
  });

  describe('capabilities', () => {
    it('should return correct capabilities', () => {
      expect(store.capabilities.supportsHybridSearch).toBe(false);
      expect(store.capabilities.supportsMetadataFiltering).toBe(false);
      expect(store.capabilities.supportsBatchUpsert).toBe(true);
      expect(store.capabilities.supportsCollectionManagement).toBe(false);
      expect(store.capabilities.supportsScan).toBe(true);
    });

    it('should report zero cost model', () => {
      expect(store.costModel.costPerQueryEstimate).toBe(0);
      expect(store.costModel.costPer1000Upserts).toBe(0);
      expect(store.costModel.monthlyBaseCost).toBe(0);
    });
  });

  describe('search', () => {
    it('should return empty array when no points indexed', async () => {
      const results = await store.search({
        vector: [0.1, 0.2, 0.3],
        topK: 10,
      });
      expect(results).toEqual([]);
    });

    it('should return sorted results by cosine similarity', async () => {
      await store.upsertBatch([
        { id: '1', vector: [1, 0, 0], payload: { content: 'one' } },
        { id: '2', vector: [0, 1, 0], payload: { content: 'two' } },
        { id: '3', vector: [0, 0, 1], payload: { content: 'three' } },
      ]);

      const results = await store.search({
        vector: [1, 0, 0],
        topK: 3,
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.chunkId).toBe('1');
      expect(results[0]!.score).toBeCloseTo(1, 2);
    });

    it('should respect topK limit', async () => {
      await store.upsertBatch([
        { id: '1', vector: [1, 0, 0], payload: { content: 'one' } },
        { id: '2', vector: [0.9, 0.1, 0], payload: { content: 'two' } },
        { id: '3', vector: [0.8, 0.2, 0], payload: { content: 'three' } },
      ]);

      const results = await store.search({
        vector: [1, 0, 0],
        topK: 2,
      });

      expect(results).toHaveLength(2);
    });

    it('should expose scanned sparse vectors for dry-run inspection', async () => {
      await store.upsertPoint({
        id: '1',
        vector: [1, 0],
        sparseVector: { indices: [123], values: [1.5] },
        payload: { content: 'hybrid point' },
      });

      const result = await store.scanPoints('sandbox');

      expect(result.points[0]?.sparseVector).toEqual({ indices: [123], values: [1.5] });
    });
  });

  describe('upsert and delete', () => {
    it('should upsert a single point', async () => {
      await store.upsertPoint({ id: '1', vector: [0.1, 0.2], payload: {} });
      const results = await store.search({ vector: [0.1, 0.2], topK: 10 });
      expect(results).toHaveLength(1);
    });

    it('should update an existing point in place', async () => {
      await store.upsertPoint({ id: '1', vector: [1, 0], payload: { content: 'first' } });
      await store.upsertPoint({ id: '1', vector: [0, 1], payload: { content: 'second' } });
      const results = await store.search({ vector: [0, 1], topK: 10 });
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toBe('second');
    });

    it('should delete collection', async () => {
      await store.upsertPoint({ id: '1', vector: [0.1, 0.2], payload: {} });
      await store.deleteCollection('test');
      const results = await store.search({ vector: [0.1, 0.2], topK: 10 });
      expect(results).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return true', async () => {
      const result = await store.healthCheck();
      expect(result).toBe(true);
    });
  });

  describe('close', () => {
    it('should not throw', async () => {
      await expect(store.close()).resolves.not.toThrow();
    });
  });

  describe('getCollectionInfo', () => {
    it('should return null on empty store', async () => {
      const info = await store.getCollectionInfo('test');
      expect(info).toBeNull();
    });

    it('should return stats when points exist', async () => {
      const named = new SandboxVectorStore({ collectionName: 'my-coll' });
      await named.upsertBatch([
        { id: '1', vector: [1, 0, 0], payload: {} },
        { id: '2', vector: [0, 1, 0], payload: {} },
      ]);
      const info = await named.getCollectionInfo('my-coll');
      expect(info).toEqual({
        collectionName: 'my-coll',
        vectorCount: 2,
        vectorDimension: 3,
      });
    });

    it('should default collectionName to sandbox when unset', async () => {
      await store.upsertPoint({ id: '1', vector: [1, 2], payload: {} });
      const info = await store.getCollectionInfo('whatever');
      expect(info?.collectionName).toBe('sandbox');
    });
  });

  describe('listCollections', () => {
    it('should return empty array when no collectionName', async () => {
      const collections = await store.listCollections();
      expect(collections).toEqual([]);
    });

    it('should return the configured collection name', async () => {
      const named = new SandboxVectorStore({ collectionName: 'docs' });
      expect(await named.listCollections()).toEqual(['docs']);
    });
  });
});

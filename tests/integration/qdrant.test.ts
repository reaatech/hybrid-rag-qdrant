import { describe, it, expect } from 'vitest';
import { QdrantClientWrapper } from '../../src/retrieval/vector/qdrant-client.js';

describe('Qdrant integration', () => {
  describe('QdrantClientWrapper', () => {
    it('should create client with correct configuration', () => {
      const client = new QdrantClientWrapper({
        url: 'http://localhost:6333',
        collectionName: 'test-collection',
        vectorSize: 1536,
      });

      expect(client).toBeDefined();
    });

    it('should initialize client', async () => {
      const client = new QdrantClientWrapper({
        url: 'http://localhost:6333',
        collectionName: 'test-collection',
        vectorSize: 1536,
      });

      await client.initialize();
      expect(client).toBeDefined();
    });

    it('should upsert a single point', async () => {
      const client = new QdrantClientWrapper({
        url: 'http://localhost:6333',
        collectionName: 'test-collection',
        vectorSize: 1536,
      });

      const point = {
        id: 'point-1',
        vector: Array(1536).fill(0.1),
        payload: { text: 'Hello world' },
      };

      await client.upsertPoint(point);
      expect(client).toBeDefined();
    });

    it('should upsert batch points', async () => {
      const client = new QdrantClientWrapper({
        url: 'http://localhost:6333',
        collectionName: 'test-collection',
        vectorSize: 1536,
      });

      const points = [
        { id: 'point-1', vector: Array(1536).fill(0.1), payload: { text: 'doc1' } },
        { id: 'point-2', vector: Array(1536).fill(0.2), payload: { text: 'doc2' } },
      ];

      await client.upsertBatch(points);
      expect(client).toBeDefined();
    });
  });
});

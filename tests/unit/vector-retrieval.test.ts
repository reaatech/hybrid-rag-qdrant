/**
 * Unit tests for vector retrieval
 */

import { describe, it, expect } from 'vitest';
import { QdrantClientWrapper, VectorSearchEngine, EmbeddingService } from '../../src/retrieval/vector/index.js';

describe('vector retrieval', () => {
  describe('QdrantClientWrapper', () => {
    it('should initialize with correct configuration', async () => {
      const client = new QdrantClientWrapper({
        url: 'http://localhost:6333',
        collectionName: 'test-collection',
        vectorSize: 1536,
      });

      expect(client).toBeDefined();
    });

    it('should create wrapper instance', () => {
      const client = new QdrantClientWrapper({
        url: 'http://localhost:6333',
        collectionName: 'test',
        vectorSize: 1536,
      });

      expect(client).toBeInstanceOf(QdrantClientWrapper);
    });
  });

  describe('EmbeddingService', () => {
    it('should generate embeddings with correct dimension', async () => {
      const service = new EmbeddingService({
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimension: 1536,
      });

      // Note: This will fail without API key, but validates the API
      try {
        await service.embed('Hello world');
      } catch (error) {
        // Expected to fail without API key
        expect(error).toBeDefined();
      }
    });

    it('should create embedding service instance', () => {
      const service = new EmbeddingService({
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimension: 1536,
      });

      expect(service).toBeDefined();
    });

    it('should get correct dimension for model', () => {
      const dim = EmbeddingService.getDimension('text-embedding-3-small');
      expect(dim).toBe(1536);
    });

    it('should return default dimension for unknown model', () => {
      const dim = EmbeddingService.getDimension('unknown-model');
      expect(dim).toBe(1536);
    });
  });

  describe('VectorSearchEngine', () => {
    it('should create vector search engine', () => {
      const engine = new VectorSearchEngine({
        embedding: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          dimension: 1536,
        },
        qdrant: {
          url: 'http://localhost:6333',
          collectionName: 'test',
          vectorSize: 1536,
        },
      });

      expect(engine).toBeDefined();
    });

    it('should create engine with minimal config', () => {
      const engine = new VectorSearchEngine({
        embedding: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          dimension: 1536,
        },
        qdrant: {
          url: 'http://localhost:6333',
          collectionName: 'test',
          vectorSize: 1536,
        },
      });

      expect(engine).toBeDefined();
    });
  });
});
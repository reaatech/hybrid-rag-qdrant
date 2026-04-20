/**
 * Integration tests for RAG pipeline
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { RAGPipeline } from '../../src/pipeline.js';
import type { Document } from '../../src/types/domain.js';

// Mock external dependencies for integration testing without real APIs
vi.mock('../../src/retrieval/vector/embedding.js', () => ({
  EmbeddingService: class MockEmbeddingService {
    async embed(texts: string[]) {
      return texts.map(() =>
        Array(1536)
          .fill(0)
          .map(() => Math.random()),
      );
    }
    async embedBatch(texts: string[]) {
      return Promise.all(texts.map((text) => this.embed(text)));
    }
    getTokenCount(text: string) {
      return Math.ceil(text.length / 4);
    }
    getCost(tokens: number) {
      return tokens * 0.00002;
    }
    static getDimension(_model: string) {
      return 1536;
    }
  },
  EmbeddingConfig: {},
  EmbeddingResult: {},
  EmbeddingProvider: {},
}));

describe('RAGPipeline Integration', () => {
  let pipeline: RAGPipeline;

  const testDocuments: Document[] = [
    {
      id: 'doc-1',
      content:
        'The quick brown fox jumps over the lazy dog. This is a test document about animals.',
      source: 'test',
      contentHash: 'hash1',
      fileSize: 80,
      contentType: 'text/plain',
      metadata: { category: 'test' },
    },
    {
      id: 'doc-2',
      content:
        'Machine learning is a subset of artificial intelligence. It uses algorithms to learn from data.',
      source: 'test',
      contentHash: 'hash2',
      fileSize: 100,
      contentType: 'text/plain',
      metadata: { category: 'tech' },
    },
  ];

  beforeAll(async () => {
    pipeline = new RAGPipeline({
      qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      embeddingProvider: 'mock',
    });
    await pipeline.initialize();
  });

  afterAll(async () => {
    await pipeline.close();
  });

  it('should initialize pipeline', () => {
    expect(pipeline).toBeDefined();
  });

  it('should ingest documents', async () => {
    const result = await pipeline.ingest(testDocuments);

    expect(result.ingested).toBe(testDocuments.length);
    expect(result.chunksCreated).toBeGreaterThan(0);
  });

  it('should query and return results', async () => {
    // First ingest
    await pipeline.ingest(testDocuments);

    // Then query
    const results = await pipeline.query('What is machine learning?', {
      topK: 5,
      retrievalMode: 'hybrid',
    });

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  it('should support different retrieval modes', async () => {
    await pipeline.ingest(testDocuments);

    // Vector only
    const vectorResults = await pipeline.query('test', {
      topK: 5,
      retrievalMode: 'vector',
    });
    expect(vectorResults).toBeDefined();

    // BM25 only
    const bm25Results = await pipeline.query('test', {
      topK: 5,
      retrievalMode: 'bm25',
    });
    expect(bm25Results).toBeDefined();
  });

  it('should apply filters', async () => {
    await pipeline.ingest(testDocuments);

    const results = await pipeline.query('test', {
      topK: 5,
      filter: { category: 'tech' },
    });

    expect(results).toBeDefined();
  });
});

describe('Hybrid Retrieval Integration', () => {
  it('should combine vector and BM25 results', async () => {
    // This test verifies the fusion logic works end-to-end
    const pipeline = new RAGPipeline({
      qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      embeddingProvider: 'mock',
      fusionStrategy: 'rrf',
    });

    await pipeline.initialize();

    const docs: Document[] = [
      {
        id: 'test-1',
        content: 'Python programming language for data science',
        source: 'test',
        contentHash: 'h1',
        fileSize: 50,
        contentType: 'text/plain',
        metadata: {},
      },
    ];

    await pipeline.ingest(docs);

    const results = await pipeline.query('python data', {
      topK: 5,
      retrievalMode: 'hybrid',
    });

    expect(results.length).toBeGreaterThan(0);

    await pipeline.close();
  });
});

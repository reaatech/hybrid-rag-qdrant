import { describe, expect, it } from 'vitest';
import {
  BM25QuerySchema,
  ChunkingConfigSchema,
  VectorQuerySchema,
  validateAblationConfig,
  validateBM25Query,
  validateChunk,
  validateChunkingConfig,
  validateDocument,
  validateEvaluationSample,
  validateVectorQuery,
} from './schemas.js';

describe('validateDocument', () => {
  it('should parse a valid document', () => {
    const doc = validateDocument({
      id: 'doc-1',
      content: 'hello world',
      source: '/path/to/file.md',
      metadata: {},
    });
    expect(doc.id).toBe('doc-1');
    expect(doc.content).toBe('hello world');
    expect(doc.source).toBe('/path/to/file.md');
  });

  it('should accept URL sources', () => {
    const doc = validateDocument({
      id: 'doc-1',
      content: 'content',
      source: 'https://example.com/doc.md',
      metadata: {},
    });
    expect(doc.source).toBe('https://example.com/doc.md');
  });

  it('should default metadata to {}', () => {
    const doc = validateDocument({
      id: 'doc-1',
      content: 'content',
      source: '/path',
    });
    expect(doc.metadata).toEqual({});
  });

  it('should reject empty id', () => {
    expect(() => validateDocument({ id: '', content: 'x', source: '/p', metadata: {} })).toThrow();
  });

  it('should reject empty content', () => {
    expect(() => validateDocument({ id: 'x', content: '', source: '/p', metadata: {} })).toThrow();
  });

  it('should reject invalid source', () => {
    expect(() =>
      validateDocument({ id: 'x', content: 'x', source: 'relative', metadata: {} }),
    ).toThrow();
  });

  it('should reject negative fileSize', () => {
    expect(() =>
      validateDocument({
        id: 'x',
        content: 'x',
        source: '/p',
        metadata: {},
        fileSize: -5,
      }),
    ).toThrow();
  });
});

describe('validateChunk', () => {
  const baseChunk = {
    id: 'chunk-1',
    documentId: 'doc-1',
    index: 0,
    content: 'chunk content',
    tokenCount: 10,
    characterCount: 50,
    startPosition: 0,
    endPosition: 50,
    metadata: {},
    strategy: 'fixed-size' as const,
  };

  it('should parse a valid chunk', () => {
    const chunk = validateChunk(baseChunk);
    expect(chunk.id).toBe('chunk-1');
    expect(chunk.documentId).toBe('doc-1');
  });

  it('should reject missing required fields', () => {
    expect(() => validateChunk({ id: 'chunk-1' })).toThrow();
  });

  it('should reject negative index', () => {
    expect(() => validateChunk({ ...baseChunk, index: -1 })).toThrow();
  });

  it('should reject non-positive tokenCount', () => {
    expect(() => validateChunk({ ...baseChunk, tokenCount: 0 })).toThrow();
  });

  it('should accept optional embedding', () => {
    const chunk = validateChunk({ ...baseChunk, embedding: [0.1, 0.2] });
    expect(chunk.embedding).toEqual([0.1, 0.2]);
  });

  it('should reject invalid strategy', () => {
    expect(() => validateChunk({ ...baseChunk, strategy: 'unknown' })).toThrow();
  });
});

describe('validateChunkingConfig', () => {
  it('should parse with minimal required fields', () => {
    const config = validateChunkingConfig({
      strategy: 'fixed-size',
      chunkSize: 256,
      overlap: 25,
    });
    expect(config.strategy).toBe('fixed-size');
    expect(config.chunkSize).toBe(256);
    expect(config.overlap).toBe(25);
  });

  it('should apply defaults for chunkSize and overlap', () => {
    const config = validateChunkingConfig({
      strategy: 'recursive',
    });
    expect(config.chunkSize).toBe(512);
    expect(config.overlap).toBe(50);
  });

  it('should reject negative overlap', () => {
    expect(() =>
      validateChunkingConfig({ strategy: 'fixed-size', chunkSize: 100, overlap: -1 }),
    ).toThrow();
  });

  it('should accept all strategies types', () => {
    for (const s of ['fixed-size', 'semantic', 'recursive', 'sliding-window'] as const) {
      expect(
        ChunkingConfigSchema.safeParse({ strategy: s, chunkSize: 100, overlap: 0 }).success,
      ).toBe(true);
    }
  });

  it('should accept optional separators', () => {
    const config = validateChunkingConfig({
      strategy: 'recursive',
      chunkSize: 500,
      overlap: 50,
      separators: ['\n\n', '\n', '.'],
    });
    expect(config.separators).toEqual(['\n\n', '\n', '.']);
  });

  it('should accept similarityThreshold for semantic strategy', () => {
    const config = validateChunkingConfig({
      strategy: 'semantic',
      chunkSize: 500,
      overlap: 50,
      similarityThreshold: 0.8,
    });
    expect(config.similarityThreshold).toBe(0.8);
  });

  it('should reject similarityThreshold out of range', () => {
    expect(() =>
      validateChunkingConfig({
        strategy: 'semantic',
        chunkSize: 500,
        overlap: 50,
        similarityThreshold: 1.5,
      }),
    ).toThrow();
  });
});

describe('validateEvaluationSample', () => {
  it('should parse a valid sample', () => {
    const sample = validateEvaluationSample({
      query_id: 'q-1',
      query: 'test query',
      relevant_docs: ['doc-1'],
      relevant_chunks: ['chunk-1'],
    });
    expect(sample.query_id).toBe('q-1');
    expect(sample.ideal_answer).toBeUndefined();
  });

  it('should reject empty query', () => {
    expect(() =>
      validateEvaluationSample({
        query_id: 'q-1',
        query: '',
        relevant_docs: ['doc-1'],
        relevant_chunks: ['chunk-1'],
      }),
    ).toThrow();
  });

  it('should reject empty relevant_docs', () => {
    expect(() =>
      validateEvaluationSample({
        query_id: 'q-1',
        query: 'test',
        relevant_docs: [],
        relevant_chunks: ['chunk-1'],
      }),
    ).toThrow();
  });

  it('should accept ideal_answer', () => {
    const sample = validateEvaluationSample({
      query_id: 'q-1',
      query: 'test',
      relevant_docs: ['doc-1'],
      relevant_chunks: ['chunk-1'],
      ideal_answer: 'expected answer',
    });
    expect(sample.ideal_answer).toBe('expected answer');
  });
});

describe('validateAblationConfig', () => {
  it('should parse with minimal fields, applying defaults', () => {
    const config = validateAblationConfig({
      baseline: {},
      variants: [{ name: 'v1', changes: { chunking: 'semantic' } }],
    });
    expect(config.baseline.chunking).toBe('fixed-size');
    expect(config.baseline.chunkSize).toBe(512);
    expect(config.baseline.retrieval).toBe('hybrid');
    expect(config.baseline.vectorWeight).toBe(0.7);
    expect(config.baseline.reranker).toBeNull();
    expect(config.baseline.topK).toBe(10);
    expect(config.variants[0].name).toBe('v1');
  });

  it('should reject empty variant name', () => {
    expect(() =>
      validateAblationConfig({
        baseline: {},
        variants: [{ name: '', changes: {} }],
      }),
    ).toThrow();
  });

  it('should reject invalid vectorWeight', () => {
    expect(() =>
      validateAblationConfig({
        baseline: { vectorWeight: 1.5 },
        variants: [{ name: 'v1', changes: {} }],
      }),
    ).toThrow();
  });

  it('should accept nullable reranker', () => {
    const config = validateAblationConfig({
      baseline: { reranker: null },
      variants: [{ name: 'v1', changes: { reranker: 'cohere' } }],
    });
    expect(config.baseline.reranker).toBeNull();
  });
});

describe('validateVectorQuery', () => {
  it('should parse valid vector query', () => {
    const q = validateVectorQuery({ vector: [0.1, 0.2, 0.3], topK: 5 });
    expect(q.vector).toHaveLength(3);
    expect(q.topK).toBe(5);
  });

  it('should default topK to 10', () => {
    const q = validateVectorQuery({ vector: [0.1, 0.2] });
    expect(q.topK).toBe(10);
  });

  it('should reject empty vector', () => {
    expect(() => validateVectorQuery({ vector: [] })).toThrow();
  });

  it('should accept all distance metrics', () => {
    for (const d of ['cosine', 'euclidean', 'dot'] as const) {
      const q = validateVectorQuery({ vector: [0.1], distance: d });
      expect(q.distance).toBe(d);
    }
  });

  it('should reject invalid distance', () => {
    expect(VectorQuerySchema.safeParse({ vector: [0.1], distance: 'manhattan' }).success).toBe(
      false,
    );
  });

  it('should accept optional filter and collection', () => {
    const q = validateVectorQuery({
      vector: [0.1],
      filter: { department: 'eng' },
      collection: 'docs',
    });
    expect(q.filter).toEqual({ department: 'eng' });
    expect(q.collection).toBe('docs');
  });
});

describe('validateBM25Query', () => {
  it('should parse valid BM25 query', () => {
    const q = validateBM25Query({ query: 'test search', topK: 5 });
    expect(q.query).toBe('test search');
    expect(q.topK).toBe(5);
  });

  it('should default topK, k1, b parameters', () => {
    const q = validateBM25Query({ query: 'search' });
    expect(q.topK).toBe(10);
    expect(q.k1).toBe(1.2);
    expect(q.b).toBe(0.75);
  });

  it('should reject empty query', () => {
    expect(() => validateBM25Query({ query: '' })).toThrow();
  });

  it('should accept optional filter', () => {
    const q = validateBM25Query({ query: 'search', filter: { status: 'active' } });
    expect(q.filter).toEqual({ status: 'active' });
  });

  it('should reject out-of-range b parameter', () => {
    expect(BM25QuerySchema.safeParse({ query: 'test', b: 2 }).success).toBe(false);
  });
});

/**
 * Unit tests for types/schemas
 */

import { describe, it, expect } from 'vitest';

describe('types/schemas', async () => {
  const {
    DocumentSchema,
    ChunkSchema,
    ChunkingConfigSchema,
    EvaluationSampleSchema,
    AblationConfigSchema,
    VectorQuerySchema,
    BM25QuerySchema,
    validateDocument,
    validateChunk,
    validateChunkingConfig,
    validateEvaluationSample,
    validateAblationConfig,
    validateVectorQuery,
    validateBM25Query,
  } = await import('../../../src/types/schemas.js');

  describe('DocumentSchema', () => {
    it('should validate a valid document with URL source', () => {
      const doc = {
        id: 'doc-1',
        content: 'Test content',
        source: 'https://example.com/doc.pdf',
      };
      const result = DocumentSchema.parse(doc);
      expect(result.id).toBe('doc-1');
      expect(result.content).toBe('Test content');
      expect(result.source).toBe('https://example.com/doc.pdf');
    });

    it('should validate a valid document with absolute path source', () => {
      const doc = {
        id: 'doc-2',
        content: 'Test content',
        source: '/absolute/path/to/doc.pdf',
      };
      const result = DocumentSchema.parse(doc);
      expect(result.source).toBe('/absolute/path/to/doc.pdf');
    });

    it('should reject document without id', () => {
      const doc = {
        content: 'Test content',
        source: 'https://example.com/doc.pdf',
      };
      expect(() => DocumentSchema.parse(doc)).toThrow();
    });

    it('should reject document without content', () => {
      const doc = {
        id: 'doc-1',
        source: 'https://example.com/doc.pdf',
      };
      expect(() => DocumentSchema.parse(doc)).toThrow();
    });

    it('should reject document with invalid source (relative path)', () => {
      const doc = {
        id: 'doc-1',
        content: 'Test content',
        source: 'relative/path/doc.pdf',
      };
      expect(() => DocumentSchema.parse(doc)).toThrow();
    });

    it('should allow optional fields', () => {
      const doc = {
        id: 'doc-1',
        content: 'Test content',
        source: 'https://example.com/doc.pdf',
        title: 'Optional Title',
        author: 'Optional Author',
        metadata: { key: 'value' },
      };
      const result = DocumentSchema.parse(doc);
      expect(result.title).toBe('Optional Title');
      expect(result.author).toBe('Optional Author');
    });

    it('should reject negative fileSize', () => {
      const doc = {
        id: 'doc-1',
        content: 'Test content',
        source: 'https://example.com/doc.pdf',
        fileSize: -100,
      };
      expect(() => DocumentSchema.parse(doc)).toThrow();
    });
  });

  describe('ChunkSchema', () => {
    it('should validate a valid chunk', () => {
      const chunk = {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'Chunk content',
        tokenCount: 100,
        characterCount: 500,
        startPosition: 0,
        endPosition: 500,
        metadata: {},
        strategy: 'fixed-size',
      };
      const result = ChunkSchema.parse(chunk);
      expect(result.id).toBe('chunk-1');
      expect(result.strategy).toBe('fixed-size');
    });

    it('should accept all valid strategy values', () => {
      const strategies = ['fixed-size', 'semantic', 'recursive', 'sliding-window'];
      for (const strategy of strategies) {
        const chunk = {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          content: 'Chunk content',
          tokenCount: 100,
          characterCount: 500,
          startPosition: 0,
          endPosition: 500,
          strategy,
        };
        expect(() => ChunkSchema.parse(chunk)).not.toThrow();
      }
    });

    it('should reject invalid strategy', () => {
      const chunk = {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'Chunk content',
        tokenCount: 100,
        characterCount: 500,
        startPosition: 0,
        endPosition: 500,
        strategy: 'invalid-strategy',
      };
      expect(() => ChunkSchema.parse(chunk)).toThrow();
    });

    it('should reject chunk without id', () => {
      const chunk = {
        documentId: 'doc-1',
        index: 0,
        content: 'Chunk content',
        tokenCount: 100,
        characterCount: 500,
        startPosition: 0,
        endPosition: 500,
        strategy: 'fixed-size',
      };
      expect(() => ChunkSchema.parse(chunk)).toThrow();
    });

    it('should reject negative index', () => {
      const chunk = {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: -1,
        content: 'Chunk content',
        tokenCount: 100,
        characterCount: 500,
        startPosition: 0,
        endPosition: 500,
        strategy: 'fixed-size',
      };
      expect(() => ChunkSchema.parse(chunk)).toThrow();
    });

    it('should allow optional embedding', () => {
      const chunk = {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'Chunk content',
        tokenCount: 100,
        characterCount: 500,
        startPosition: 0,
        endPosition: 500,
        embedding: [0.1, 0.2, 0.3],
        strategy: 'fixed-size',
      };
      const result = ChunkSchema.parse(chunk);
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe('ChunkingConfigSchema', () => {
    it('should validate with all required fields', () => {
      const config = {
        strategy: 'fixed-size',
        chunkSize: 512,
        overlap: 50,
      };
      const result = ChunkingConfigSchema.parse(config);
      expect(result.strategy).toBe('fixed-size');
      expect(result.chunkSize).toBe(512);
      expect(result.overlap).toBe(50);
    });

    it('should apply default chunkSize of 512', () => {
      const config = {
        strategy: 'fixed-size',
      };
      const result = ChunkingConfigSchema.parse(config);
      expect(result.chunkSize).toBe(512);
    });

    it('should apply default overlap of 50', () => {
      const config = {
        strategy: 'fixed-size',
      };
      const result = ChunkingConfigSchema.parse(config);
      expect(result.overlap).toBe(50);
    });

    it('should accept all valid strategy values', () => {
      const strategies = ['fixed-size', 'semantic', 'recursive', 'sliding-window'];
      for (const strategy of strategies) {
        const config = { strategy };
        expect(() => ChunkingConfigSchema.parse(config)).not.toThrow();
      }
    });

    it('should accept optional similarityThreshold', () => {
      const config = {
        strategy: 'semantic',
        similarityThreshold: 0.8,
      };
      const result = ChunkingConfigSchema.parse(config);
      expect(result.similarityThreshold).toBe(0.8);
    });

    it('should reject similarityThreshold outside 0-1 range', () => {
      const config = {
        strategy: 'semantic',
        similarityThreshold: 1.5,
      };
      expect(() => ChunkingConfigSchema.parse(config)).toThrow();
    });
  });

  describe('EvaluationSampleSchema', () => {
    it('should validate a valid sample', () => {
      const sample = {
        query_id: 'q-1',
        query: 'What is the answer?',
        relevant_docs: ['doc-1'],
        relevant_chunks: ['chunk-1'],
      };
      const result = EvaluationSampleSchema.parse(sample);
      expect(result.query_id).toBe('q-1');
      expect(result.query).toBe('What is the answer?');
    });

    it('should reject without query_id', () => {
      const sample = {
        query: 'What is the answer?',
        relevant_docs: ['doc-1'],
        relevant_chunks: ['chunk-1'],
      };
      expect(() => EvaluationSampleSchema.parse(sample)).toThrow();
    });

    it('should reject without relevant_docs', () => {
      const sample = {
        query_id: 'q-1',
        query: 'What is the answer?',
        relevant_chunks: ['chunk-1'],
      };
      expect(() => EvaluationSampleSchema.parse(sample)).toThrow();
    });

    it('should allow optional ideal_answer', () => {
      const sample = {
        query_id: 'q-1',
        query: 'What is the answer?',
        relevant_docs: ['doc-1'],
        relevant_chunks: ['chunk-1'],
        ideal_answer: 'The answer is 42.',
      };
      const result = EvaluationSampleSchema.parse(sample);
      expect(result.ideal_answer).toBe('The answer is 42.');
    });
  });

  describe('AblationConfigSchema', () => {
    it('should validate with baseline and variants', () => {
      const config = {
        baseline: {
          chunking: 'fixed-size',
          chunkSize: 512,
        },
        variants: [
          {
            name: 'variant-1',
            changes: { chunkSize: 1024 },
          },
        ],
      };
      const result = AblationConfigSchema.parse(config);
      expect(result.baseline.chunking).toBe('fixed-size');
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].name).toBe('variant-1');
    });

    it('should apply defaults to baseline', () => {
      const config = {
        baseline: {},
        variants: [],
      };
      const result = AblationConfigSchema.parse(config);
      expect(result.baseline.chunking).toBe('fixed-size');
      expect(result.baseline.chunkSize).toBe(512);
      expect(result.baseline.vectorWeight).toBe(0.7);
      expect(result.baseline.bm25Weight).toBe(0.3);
    });

    it('should reject variant without name', () => {
      const config = {
        baseline: {},
        variants: [
          {
            changes: { chunkSize: 1024 },
          },
        ],
      };
      expect(() => AblationConfigSchema.parse(config)).toThrow();
    });
  });

  describe('VectorQuerySchema', () => {
    it('should validate with vector array', () => {
      const query = {
        vector: [0.1, 0.2, 0.3],
      };
      const result = VectorQuerySchema.parse(query);
      expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    });

    it('should apply default topK of 10', () => {
      const query = {
        vector: [0.1, 0.2, 0.3],
      };
      const result = VectorQuerySchema.parse(query);
      expect(result.topK).toBe(10);
    });

    it('should reject empty vector array', () => {
      const query = {
        vector: [],
      };
      expect(() => VectorQuerySchema.parse(query)).toThrow();
    });

    it('should accept valid distance enum', () => {
      const distances = ['cosine', 'euclidean', 'dot'];
      for (const distance of distances) {
        const query = { vector: [0.1], distance };
        expect(() => VectorQuerySchema.parse(query)).not.toThrow();
      }
    });
  });

  describe('BM25QuerySchema', () => {
    it('should validate with query string', () => {
      const query = {
        query: 'search terms',
      };
      const result = BM25QuerySchema.parse(query);
      expect(result.query).toBe('search terms');
    });

    it('should apply default topK of 10', () => {
      const query = { query: 'search' };
      const result = BM25QuerySchema.parse(query);
      expect(result.topK).toBe(10);
    });

    it('should apply default k1 of 1.2', () => {
      const query = { query: 'search' };
      const result = BM25QuerySchema.parse(query);
      expect(result.k1).toBe(1.2);
    });

    it('should apply default b of 0.75', () => {
      const query = { query: 'search' };
      const result = BM25QuerySchema.parse(query);
      expect(result.b).toBe(0.75);
    });

    it('should reject empty query string', () => {
      const query = { query: '' };
      expect(() => BM25QuerySchema.parse(query)).toThrow();
    });
  });

  describe('validateDocument', () => {
    it('should return parsed document', () => {
      const doc = {
        id: 'doc-1',
        content: 'Test',
        source: '/path/to/doc',
      };
      const result = validateDocument(doc);
      expect(result.id).toBe('doc-1');
    });

    it('should throw on invalid data', () => {
      expect(() => validateDocument({})).toThrow();
    });
  });

  describe('validateChunk', () => {
    it('should return parsed chunk', () => {
      const chunk = {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'Test',
        tokenCount: 10,
        characterCount: 50,
        startPosition: 0,
        endPosition: 50,
        strategy: 'fixed-size',
      };
      const result = validateChunk(chunk);
      expect(result.id).toBe('chunk-1');
    });
  });

  describe('validateChunkingConfig', () => {
    it('should return parsed config', () => {
      const config = { strategy: 'fixed-size' };
      const result = validateChunkingConfig(config);
      expect(result.strategy).toBe('fixed-size');
    });
  });

  describe('validateEvaluationSample', () => {
    it('should return parsed sample', () => {
      const sample = {
        query_id: 'q-1',
        query: 'test query',
        relevant_docs: ['doc-1'],
        relevant_chunks: ['chunk-1'],
      };
      const result = validateEvaluationSample(sample);
      expect(result.query_id).toBe('q-1');
    });
  });

  describe('validateAblationConfig', () => {
    it('should return parsed config', () => {
      const config = {
        baseline: {},
        variants: [],
      };
      const result = validateAblationConfig(config);
      expect(result.baseline).toBeDefined();
    });
  });

  describe('validateVectorQuery', () => {
    it('should return parsed query', () => {
      const query = { vector: [0.1, 0.2] };
      const result = validateVectorQuery(query);
      expect(result.vector).toEqual([0.1, 0.2]);
    });
  });

  describe('validateBM25Query', () => {
    it('should return parsed query', () => {
      const query = { query: 'test' };
      const result = validateBM25Query(query);
      expect(result.query).toBe('test');
    });
  });
});

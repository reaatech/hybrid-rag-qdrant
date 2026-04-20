import { describe, it, expect } from 'vitest';
import {
  HybridRetrievalEngine,
  reciprocalRankFusion,
  weightedSumFusion,
  normalizedFusion,
  minMaxNormalize,
} from '../../src/retrieval/fusion/index.js';

describe('hybrid retrieval integration', () => {
  describe('fusion strategies', () => {
    it('should perform RRF fusion', () => {
      const vectorResults = [
        {
          chunkId: 'c1',
          score: 0.9,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
        {
          chunkId: 'c2',
          score: 0.8,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
        {
          chunkId: 'c3',
          score: 0.7,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
      ];

      const bm25Results = [
        {
          chunkId: 'c2',
          score: 0.95,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
        {
          chunkId: 'c4',
          score: 0.85,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
        {
          chunkId: 'c1',
          score: 0.75,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
      ];

      const fused = reciprocalRankFusion(vectorResults, bm25Results, 60);

      expect(fused).toBeDefined();
      expect(Array.isArray(fused)).toBe(true);
      expect(fused.length).toBe(4);
    });

    it('should perform weighted sum fusion', () => {
      const vectorResults = [
        {
          chunkId: 'c1',
          score: 0.9,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
        {
          chunkId: 'c2',
          score: 0.8,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
      ];

      const bm25Results = [
        {
          chunkId: 'c1',
          score: 0.8,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
        {
          chunkId: 'c3',
          score: 0.7,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
      ];

      const fused = weightedSumFusion(vectorResults, bm25Results, 0.7, 0.3);

      expect(fused).toBeDefined();
      expect(Array.isArray(fused)).toBe(true);
    });

    it('should perform normalized fusion', () => {
      const vectorResults = [
        {
          chunkId: 'c1',
          score: 0.9,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
        {
          chunkId: 'c2',
          score: 0.5,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
      ];

      const bm25Results = [
        {
          chunkId: 'c1',
          score: 0.3,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
        {
          chunkId: 'c3',
          score: 0.8,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
      ];

      const fused = normalizedFusion(vectorResults, bm25Results, 0.5, 0.5);

      expect(fused).toBeDefined();
      expect(Array.isArray(fused)).toBe(true);
    });
  });

  describe('normalization', () => {
    it('should normalize scores to 0-1 range', () => {
      const scores = [100, 50, 25];
      const normalized = minMaxNormalize(scores);

      expect(normalized[0]).toBe(1);
      expect(normalized[1]).toBeCloseTo(0.333, 3);
      expect(normalized[2]).toBe(0);
    });

    it('should handle constant scores', () => {
      const scores = [50, 50, 50];
      const normalized = minMaxNormalize(scores);

      // When min === max, all become 0.5
      normalized.forEach((n) => {
        expect(n).toBe(0.5);
      });
    });
  });

  describe('end-to-end hybrid search', () => {
    it('should combine vector and BM25 results using HybridRetrievalEngine', () => {
      const engine = new HybridRetrievalEngine({
        fusion: { strategy: 'rrf' },
        topK: 10,
      });

      const vectorResults = [
        {
          chunkId: 'doc-1',
          score: 0.95,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
        {
          chunkId: 'doc-2',
          score: 0.85,
          documentId: 'd1',
          content: 'test',
          source: 'vector' as const,
          metadata: {},
        },
      ];

      const bm25Results = [
        {
          chunkId: 'doc-2',
          score: 0.9,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
        {
          chunkId: 'doc-3',
          score: 0.8,
          documentId: 'd1',
          content: 'test',
          source: 'bm25' as const,
          metadata: {},
        },
      ];

      const combined = engine.fuse(vectorResults, bm25Results);

      expect(combined).toBeDefined();
      expect(combined.length).toBeGreaterThan(0);

      // doc-2 should rank high since it appears in both
      const doc2 = combined.find((r) => r.chunkId === 'doc-2');
      expect(doc2).toBeDefined();
    });
  });
});

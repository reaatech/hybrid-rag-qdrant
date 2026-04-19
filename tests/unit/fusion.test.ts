/**
 * Unit tests for hybrid fusion strategies
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  reciprocalRankFusion,
  weightedSumFusion,
  normalizedFusion,
  applyFusion,
  HybridRetrievalEngine,
  minMaxNormalize,
  zScoreNormalize,
  normalize,
} from '../../src/retrieval/fusion/index.js';
import type { RetrievalResult } from '../../src/types/domain.js';

describe('Reciprocal Rank Fusion', () => {
  it('should combine results by rank', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.9, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
      { chunkId: 'c2', score: 0.8, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
      { chunkId: 'c3', score: 0.7, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];

    const bm25Results: RetrievalResult[] = [
      { chunkId: 'c2', score: 0.95, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
      { chunkId: 'c4', score: 0.85, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
      { chunkId: 'c1', score: 0.75, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
    ];

    const fused = reciprocalRankFusion(vectorResults, bm25Results, 60);

    expect(fused.length).toBe(4);
    // c2 should rank highest (rank 2 in vector + rank 1 in bm25)
    expect(fused[0]?.chunkId).toBe('c2');
  });

  it('should handle empty results', () => {
    const fused = reciprocalRankFusion([], [], 60);
    expect(fused.length).toBe(0);
  });

  it('should use default k value', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.9, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];

    const fused = reciprocalRankFusion(vectorResults, []);
    expect(fused.length).toBe(1);
  });
});

describe('Weighted Sum Fusion', () => {
  it('should combine scores with weights', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.8, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
      { chunkId: 'c2', score: 0.6, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];

    const bm25Results: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.4, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
      { chunkId: 'c2', score: 0.9, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
    ];

    const fused = weightedSumFusion(vectorResults, bm25Results, 0.7, 0.3);

    expect(fused.length).toBe(2);
    // c1: 0.7*0.8 + 0.3*0.4 = 0.56 + 0.12 = 0.68
    // c2: 0.7*0.6 + 0.3*0.9 = 0.42 + 0.27 = 0.69
    expect(fused[0]?.chunkId).toBe('c2');
  });

  it('should handle missing results in one source', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.8, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];

    const fused = weightedSumFusion(vectorResults, [], 0.7, 0.3);

    expect(fused.length).toBe(1);
    expect(fused[0]?.score).toBeCloseTo(0.56, 2);
  });
});

describe('Normalized Fusion', () => {
  it('should normalize scores before combining', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 100, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
      { chunkId: 'c2', score: 50, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];

    const bm25Results: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.9, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
      { chunkId: 'c2', score: 0.1, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
    ];

    const fused = normalizedFusion(vectorResults, bm25Results, 0.5, 0.5);

    expect(fused.length).toBe(2);
    // c1: normalized vector=1, normalized bm25=1 -> 0.5*1 + 0.5*1 = 1
    // c2: normalized vector=0, normalized bm25=0 -> 0.5*0 + 0.5*0 = 0
    expect(fused[0]?.chunkId).toBe('c1');
  });
});

describe('applyFusion', () => {
  it('should apply RRF strategy', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.9, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];
    const bm25Results: RetrievalResult[] = [
      { chunkId: 'c2', score: 0.9, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
    ];

    const fused = applyFusion(vectorResults, bm25Results, { strategy: 'rrf' });
    expect(fused.length).toBe(2);
  });

  it('should apply weighted-sum strategy', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.8, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];
    const bm25Results: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.4, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
    ];

    const fused = applyFusion(vectorResults, bm25Results, {
      strategy: 'weighted-sum',
      vectorWeight: 0.7,
      bm25Weight: 0.3,
    });
    expect(fused.length).toBe(1);
    expect(fused[0].score).toBeCloseTo(0.68, 2);
  });
});

describe('Normalization', () => {
  describe('minMaxNormalize', () => {
    it('should normalize scores to 0-1 range', () => {
      const scores = [10, 5, 0];
      const normalized = minMaxNormalize(scores);

      expect(normalized[0]).toBe(1);
      expect(normalized[1]).toBe(0.5);
      expect(normalized[2]).toBe(0);
    });

    it('should handle constant scores', () => {
      const scores = [5, 5, 5];
      const normalized = minMaxNormalize(scores);

      normalized.forEach(n => expect(n).toBe(0.5));
    });

    it('should handle empty array', () => {
      const normalized = minMaxNormalize([]);
      expect(normalized).toEqual([]);
    });
  });

  describe('zScoreNormalize', () => {
    it('should normalize using z-score', () => {
      const scores = [10, 20, 30];
      const normalized = zScoreNormalize(scores);

      // Mean = 20, variance = 66.67, stdDev ≈ 8.16
      // z-score of 10 = (10-20)/8.16 ≈ -1.225
      // z-score of 20 = 0
      // z-score of 30 = (30-20)/8.16 ≈ 1.225
      expect(normalized[0]).toBeCloseTo(-1.225, 1);
      expect(normalized[1]).toBeCloseTo(0, 1);
      expect(normalized[2]).toBeCloseTo(1.225, 1);
    });

    it('should handle empty array', () => {
      const normalized = zScoreNormalize([]);
      expect(normalized).toEqual([]);
    });
  });

  describe('normalize', () => {
    it('should use minmax as default method', () => {
      const scores = [0, 50, 100];
      const normalized = normalize(scores);

      expect(normalized[0]).toBe(0);
      expect(normalized[1]).toBe(0.5);
      expect(normalized[2]).toBe(1);
    });

    it('should support zscore method', () => {
      const scores = [10, 20, 30];
      const normalized = normalize(scores, 'zscore');

      expect(normalized[0]).toBeCloseTo(-1.225, 1);
      expect(normalized[1]).toBeCloseTo(0, 1);
      expect(normalized[2]).toBeCloseTo(1.225, 1);
    });
  });
});

describe('HybridRetrievalEngine', () => {
  let engine: HybridRetrievalEngine;

  beforeEach(() => {
    engine = new HybridRetrievalEngine({
      fusion: { strategy: 'rrf' },
      topK: 10,
    });
  });

  it('should fuse results', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.9, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];

    const bm25Results: RetrievalResult[] = [
      { chunkId: 'c2', score: 0.9, documentId: 'd1', content: 'test', source: 'bm25', metadata: {} },
    ];

    const fused = engine.fuse(vectorResults, bm25Results);
    expect(fused.length).toBe(2);
  });

  it('should limit results to topK', () => {
    const vectorResults: RetrievalResult[] = [
      { chunkId: 'c1', score: 0.9, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
      { chunkId: 'c2', score: 0.8, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
      { chunkId: 'c3', score: 0.7, documentId: 'd1', content: 'test', source: 'vector', metadata: {} },
    ];

    const fused = engine.fuse(vectorResults, [], { topK: 2 });
    expect(fused.length).toBe(2);
  });

  it('should report when reranker is not configured', () => {
    expect(engine.hasReranker()).toBe(false);
  });
});
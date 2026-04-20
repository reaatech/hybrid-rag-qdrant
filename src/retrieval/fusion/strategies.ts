/**
 * Fusion strategies for combining retrieval results
 */

import type { RetrievalResult } from '../../types/domain.js';

/**
 * Fusion strategy types
 */
export type FusionStrategyType = 'rrf' | 'weighted-sum' | 'normalized';

/**
 * Fusion strategy configuration
 */
export interface FusionConfig {
  /** Strategy type */
  strategy: FusionStrategyType;
  /** Weight for vector scores (for weighted-sum) */
  vectorWeight?: number;
  /** Weight for BM25 scores (for weighted-sum) */
  bm25Weight?: number;
  /** K parameter for RRF (default: 60) */
  rrfK?: number;
}

/**
 * Reciprocal Rank Fusion (RRF)
 * score = Σ 1 / (k + rank_i)
 */
export function reciprocalRankFusion(
  vectorResults: RetrievalResult[],
  bm25Results: RetrievalResult[],
  k: number = 60,
): RetrievalResult[] {
  const scoreMap = new Map<string, { result: RetrievalResult; score: number }>();

  // Process vector results
  vectorResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);

    const existing = scoreMap.get(result.chunkId);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(result.chunkId, {
        result,
        score: rrfScore,
      });
    }
  });

  // Process BM25 results
  bm25Results.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);

    const existing = scoreMap.get(result.chunkId);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(result.chunkId, {
        result,
        score: rrfScore,
      });
    }
  });

  // Sort by combined score and return
  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ result, score }) => ({ ...result, score }));
}

/**
 * Weighted Sum Fusion
 * score = w1 * vector_score + w2 * bm25_score
 */
export function weightedSumFusion(
  vectorResults: RetrievalResult[],
  bm25Results: RetrievalResult[],
  vectorWeight: number = 0.7,
  bm25Weight: number = 0.3,
): RetrievalResult[] {
  const scoreMap = new Map<
    string,
    { result: RetrievalResult; vectorScore: number; bm25Score: number }
  >();

  // Process vector results
  vectorResults.forEach((result) => {
    scoreMap.set(result.chunkId, {
      result,
      vectorScore: result.score,
      bm25Score: 0,
    });
  });

  // Process BM25 results
  bm25Results.forEach((result) => {
    const existing = scoreMap.get(result.chunkId);
    if (existing) {
      existing.bm25Score = result.score;
    } else {
      scoreMap.set(result.chunkId, {
        result,
        vectorScore: 0,
        bm25Score: result.score,
      });
    }
  });

  // Calculate weighted scores and sort
  return [...scoreMap.values()]
    .map(({ result, vectorScore, bm25Score }) => ({
      ...result,
      score: vectorWeight * vectorScore + bm25Weight * bm25Score,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Normalized Score Fusion
 * score = w1 * norm(vector_score) + w2 * norm(bm25_score)
 */
export function normalizedFusion(
  vectorResults: RetrievalResult[],
  bm25Results: RetrievalResult[],
  vectorWeight: number = 0.7,
  bm25Weight: number = 0.3,
): RetrievalResult[] {
  // Normalize scores to [0, 1] range
  const normalizeScores = (results: RetrievalResult[]): Map<string, number> => {
    const map = new Map<string, number>();
    if (results.length === 0) {
      return map;
    }

    const scores = results.map((r) => r.score);
    const minScore = scores.reduce((a, b) => Math.min(a, b), Infinity);
    const maxScore = scores.reduce((a, b) => Math.max(a, b), -Infinity);
    const range = maxScore - minScore || 1;

    results.forEach((r) => {
      map.set(r.chunkId, (r.score - minScore) / range);
    });

    return map;
  };

  const normalizedVector = normalizeScores(vectorResults);
  const normalizedBM25 = normalizeScores(bm25Results);

  // Combine all unique chunk IDs
  const allChunkIds = new Set([...normalizedVector.keys(), ...normalizedBM25.keys()]);

  const combinedScores = [...allChunkIds].map((chunkId) => {
    const vectorNorm = normalizedVector.get(chunkId) ?? 0;
    const bm25Norm = normalizedBM25.get(chunkId) ?? 0;

    // Find original result
    const result =
      vectorResults.find((r) => r.chunkId === chunkId) ??
      bm25Results.find((r) => r.chunkId === chunkId)!;

    return {
      ...result,
      score: vectorWeight * vectorNorm + bm25Weight * bm25Norm,
    };
  });

  return combinedScores.sort((a, b) => b.score - a.score);
}

/**
 * Apply fusion strategy
 */
export function applyFusion(
  vectorResults: RetrievalResult[],
  bm25Results: RetrievalResult[],
  config: FusionConfig,
): RetrievalResult[] {
  switch (config.strategy) {
    case 'rrf':
      return reciprocalRankFusion(vectorResults, bm25Results, config.rrfK);
    case 'weighted-sum':
      return weightedSumFusion(
        vectorResults,
        bm25Results,
        config.vectorWeight ?? 0.7,
        config.bm25Weight ?? 0.3,
      );
    case 'normalized':
      return normalizedFusion(
        vectorResults,
        bm25Results,
        config.vectorWeight ?? 0.7,
        config.bm25Weight ?? 0.3,
      );
    default:
      throw new Error(`Unknown fusion strategy: ${config.strategy}`);
  }
}

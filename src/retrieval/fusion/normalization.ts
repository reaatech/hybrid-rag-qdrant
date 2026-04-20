/**
 * Score normalization utilities
 */

/**
 * Normalization method types
 */
export type NormalizationMethod = 'minmax' | 'zscore' | 'rank';

/**
 * Min-max normalization
 * normalized = (value - min) / (max - min)
 */
export function minMaxNormalize(scores: number[]): number[] {
  if (scores.length === 0) {
    return [];
  }

  const min = scores.reduce((a, b) => Math.min(a, b), Infinity);
  const max = scores.reduce((a, b) => Math.max(a, b), -Infinity);
  const range = max - min;

  if (range === 0) {
    return scores.map(() => 0.5);
  }

  return scores.map((s) => (s - min) / range);
}

/**
 * Z-score normalization
 * normalized = (value - mean) / stdDev
 */
export function zScoreNormalize(scores: number[]): number[] {
  if (scores.length === 0) {
    return [];
  }

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return scores.map(() => 0);
  }

  return scores.map((s) => (s - mean) / stdDev);
}

/**
 * Rank-based normalization
 * normalized = 1 - (rank / total)
 */
export function rankNormalize(scores: number[]): number[] {
  if (scores.length === 0) {
    return [];
  }

  // Get sorted indices
  const indexed = scores.map((s, i) => ({ score: s, index: i }));
  indexed.sort((a, b) => b.score - a.score);

  const normalized = new Array(scores.length).fill(0);
  const total = scores.length;

  indexed.forEach((item, rank) => {
    normalized[item.index] = 1 - rank / total;
  });

  return normalized;
}

/**
 * Apply normalization
 */
export function normalize(scores: number[], method: NormalizationMethod = 'minmax'): number[] {
  switch (method) {
    case 'minmax':
      return minMaxNormalize(scores);
    case 'zscore':
      return zScoreNormalize(scores);
    case 'rank':
      return rankNormalize(scores);
    default:
      throw new Error(`Unknown normalization method: ${method}`);
  }
}

import { describe, expect, it } from 'vitest';
import {
  aggregateMetrics,
  averagePrecision,
  dcgAtK,
  evaluateQuery,
  idcgAtK,
  ndcgAtK,
  precisionAtK,
  type QueryEvaluationResult,
  recallAtK,
  reciprocalRank,
} from './retrieval.js';

describe('precisionAtK', () => {
  it('computes precision over the top-k slice', () => {
    expect(precisionAtK(['a', 'b', 'c', 'd'], ['a', 'c'], 4)).toBe(0.5);
  });

  it('only counts the top-k items', () => {
    expect(precisionAtK(['a', 'b', 'c'], ['c'], 2)).toBe(0);
  });

  it('returns 0 when nothing retrieved', () => {
    expect(precisionAtK([], ['a'], 5)).toBe(0);
  });
});

describe('recallAtK', () => {
  it('computes recall over relevant set', () => {
    expect(recallAtK(['a', 'b'], ['a', 'c'], 2)).toBe(0.5);
  });

  it('returns 0 when there are no relevant docs', () => {
    expect(recallAtK(['a'], [], 2)).toBe(0);
  });
});

describe('dcg / idcg / ndcg', () => {
  it('computes dcg for a perfect ranking', () => {
    // both relevant at positions 0 and 1
    const dcg = dcgAtK(['a', 'b'], ['a', 'b'], 2);
    expect(dcg).toBeCloseTo(1 + 1 / Math.log2(3), 6);
  });

  it('computes idcg for the ideal ranking', () => {
    expect(idcgAtK(['a', 'b'], 2)).toBeCloseTo(1 + 1 / Math.log2(3), 6);
  });

  it('caps idcg at k', () => {
    expect(idcgAtK(['a', 'b', 'c'], 1)).toBe(1);
  });

  it('returns 1 for a perfect ndcg ranking', () => {
    expect(ndcgAtK(['a', 'b'], ['a', 'b'], 2)).toBeCloseTo(1, 6);
  });

  it('returns 0 ndcg when there are no relevant docs', () => {
    expect(ndcgAtK(['a'], [], 5)).toBe(0);
  });
});

describe('averagePrecision', () => {
  it('rewards relevant items ranked earlier', () => {
    // retrieved a(rel), b(not), c(rel); relevant=[a,c]
    // ap = (1/1 + 2/3) / 2
    expect(averagePrecision(['a', 'b', 'c'], ['a', 'c'], 3)).toBeCloseTo((1 + 2 / 3) / 2, 6);
  });

  it('returns 0 with no relevant docs', () => {
    expect(averagePrecision(['a'], [], 3)).toBe(0);
  });
});

describe('reciprocalRank', () => {
  it('returns inverse of first relevant position', () => {
    expect(reciprocalRank(['x', 'y', 'a'], ['a'])).toBeCloseTo(1 / 3, 6);
  });

  it('returns 0 when no relevant item is retrieved', () => {
    expect(reciprocalRank(['x', 'y'], ['z'])).toBe(0);
  });
});

describe('evaluateQuery', () => {
  it('produces a full result object', () => {
    const r = evaluateQuery('q1', ['a', 'b'], ['a'], 2);
    expect(r.queryId).toBe('q1');
    expect(r.precision).toBe(0.5);
    expect(r.recall).toBe(1);
    expect(r.reciprocalRank).toBe(1);
    expect(r.ndcg).toBeGreaterThan(0);
    expect(r.averagePrecision).toBeGreaterThan(0);
  });

  it('defaults k to 10', () => {
    const r = evaluateQuery('q2', ['a'], ['a']);
    expect(r.precision).toBe(1);
  });
});

describe('aggregateMetrics', () => {
  it('returns zeroes for an empty list', () => {
    const m = aggregateMetrics([]);
    expect(m).toEqual({
      precisionAtK: 0,
      recallAtK: 0,
      ndcgAtK: 0,
      map: 0,
      mrr: 0,
      queryResults: [],
    });
  });

  it('averages metrics across queries', () => {
    const results: QueryEvaluationResult[] = [
      { queryId: 'a', precision: 1, recall: 1, ndcg: 1, averagePrecision: 1, reciprocalRank: 1 },
      { queryId: 'b', precision: 0, recall: 0, ndcg: 0, averagePrecision: 0, reciprocalRank: 0 },
    ];
    const m = aggregateMetrics(results);
    expect(m.precisionAtK).toBe(0.5);
    expect(m.recallAtK).toBe(0.5);
    expect(m.ndcgAtK).toBe(0.5);
    expect(m.map).toBe(0.5);
    expect(m.mrr).toBe(0.5);
    expect(m.queryResults).toHaveLength(2);
  });
});

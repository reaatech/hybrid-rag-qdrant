import { describe, expect, it } from 'vitest';
import { minMaxNormalize, normalize, rankNormalize, zScoreNormalize } from './normalization.js';

describe('minMaxNormalize', () => {
  it('returns [] for empty', () => {
    expect(minMaxNormalize([])).toEqual([]);
  });

  it('normalizes to [0,1]', () => {
    expect(minMaxNormalize([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  it('returns 0.5 for all-equal (zero range)', () => {
    expect(minMaxNormalize([3, 3, 3])).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('zScoreNormalize', () => {
  it('returns [] for empty', () => {
    expect(zScoreNormalize([])).toEqual([]);
  });

  it('returns zeros when stddev is 0', () => {
    expect(zScoreNormalize([4, 4, 4])).toEqual([0, 0, 0]);
  });

  it('produces zero-mean output', () => {
    const out = zScoreNormalize([1, 2, 3]);
    const mean = out.reduce((a, b) => a + b, 0) / out.length;
    expect(mean).toBeCloseTo(0, 6);
    expect(out[0]!).toBeLessThan(0);
    expect(out[2]!).toBeGreaterThan(0);
  });
});

describe('rankNormalize', () => {
  it('returns [] for empty', () => {
    expect(rankNormalize([])).toEqual([]);
  });

  it('ranks highest score first', () => {
    const out = rankNormalize([0.1, 0.9, 0.5]);
    // index 1 (0.9) is rank 0 -> 1 - 0/3 = 1
    expect(out[1]!).toBeCloseTo(1, 6);
    expect(out[0]!).toBeLessThan(out[2]!);
  });
});

describe('normalize', () => {
  it('defaults to minmax', () => {
    expect(normalize([0, 10])).toEqual([0, 1]);
  });

  it('dispatches minmax', () => {
    expect(normalize([0, 10], 'minmax')).toEqual([0, 1]);
  });

  it('dispatches zscore', () => {
    expect(normalize([4, 4], 'zscore')).toEqual([0, 0]);
  });

  it('dispatches rank', () => {
    const out = normalize([1, 2], 'rank');
    expect(out).toHaveLength(2);
  });

  it('throws on unknown method', () => {
    expect(() => normalize([1], 'bogus' as never)).toThrow('Unknown normalization method');
  });
});

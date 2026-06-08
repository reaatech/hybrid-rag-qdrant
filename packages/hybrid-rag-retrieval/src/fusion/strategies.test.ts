import type { RetrievalResult } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import {
  applyFusion,
  type FusionConfig,
  normalizedFusion,
  reciprocalRankFusion,
  weightedSumFusion,
} from './strategies.js';

function vr(chunkId: string, score: number, source: 'vector' | 'bm25' = 'vector'): RetrievalResult {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    content: `content-${chunkId}`,
    score,
    source,
    metadata: {},
  };
}

describe('reciprocalRankFusion', () => {
  it('combines overlapping chunks by summing rrf scores', () => {
    const vector = [vr('a', 0.9), vr('b', 0.5)];
    const bm25 = [vr('a', 3, 'bm25'), vr('c', 2, 'bm25')];

    const fused = reciprocalRankFusion(vector, bm25, 60);

    // 'a' appears in both lists, so it gets the highest combined score
    expect(fused[0]!.chunkId).toBe('a');
    const ids = fused.map((r) => r.chunkId).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('uses default k when not provided', () => {
    const fused = reciprocalRankFusion([vr('a', 1)], [vr('a', 1, 'bm25')]);
    expect(fused).toHaveLength(1);
    // 2 * 1/(60+1)
    expect(fused[0]!.score).toBeCloseTo(2 / 61, 6);
  });

  it('handles empty inputs', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  it('accumulates duplicate chunkIds within the same result list', () => {
    const vector = [vr('a', 1), vr('a', 0.5)];
    const fused = reciprocalRankFusion(vector, [], 60);
    expect(fused).toHaveLength(1);
    // 1/(60+1) + 1/(60+2)
    expect(fused[0]!.score).toBeCloseTo(1 / 61 + 1 / 62, 6);
  });
});

describe('weightedSumFusion', () => {
  it('weights vector and bm25 scores', () => {
    const vector = [vr('a', 1), vr('b', 0.5)];
    const bm25 = [vr('a', 0.4, 'bm25'), vr('c', 0.8, 'bm25')];

    const fused = weightedSumFusion(vector, bm25, 0.7, 0.3);

    const a = fused.find((r) => r.chunkId === 'a')!;
    expect(a.score).toBeCloseTo(0.7 * 1 + 0.3 * 0.4, 6);
    const c = fused.find((r) => r.chunkId === 'c')!;
    expect(c.score).toBeCloseTo(0.3 * 0.8, 6);
    // sorted descending
    expect(fused[0]!.score).toBeGreaterThanOrEqual(fused[1]!.score);
  });

  it('uses default weights', () => {
    const fused = weightedSumFusion([vr('a', 1)], []);
    expect(fused[0]!.score).toBeCloseTo(0.7, 6);
  });
});

describe('normalizedFusion', () => {
  it('normalizes scores per source then combines', () => {
    const vector = [vr('a', 10), vr('b', 0)];
    const bm25 = [vr('a', 5, 'bm25'), vr('c', 0, 'bm25')];

    const fused = normalizedFusion(vector, bm25, 0.5, 0.5);
    // 'a' is max in both -> normalized 1 in both -> score 1
    const a = fused.find((r) => r.chunkId === 'a')!;
    expect(a.score).toBeCloseTo(1, 6);
    expect(fused[0]!.chunkId).toBe('a');
  });

  it('returns empty for empty inputs', () => {
    expect(normalizedFusion([], [])).toEqual([]);
  });

  it('handles single-element source (range fallback to 1)', () => {
    const fused = normalizedFusion([vr('a', 7)], [], 1, 0);
    expect(fused).toHaveLength(1);
    expect(fused[0]!.score).toBeCloseTo(0, 6);
  });

  it('pulls original result from bm25 when not in vector', () => {
    const fused = normalizedFusion([vr('a', 1)], [vr('z', 2, 'bm25')], 0.5, 0.5);
    const z = fused.find((r) => r.chunkId === 'z')!;
    expect(z.documentId).toBe('doc-z');
  });
});

describe('applyFusion', () => {
  const vector = [vr('a', 1)];
  const bm25 = [vr('b', 1, 'bm25')];

  it('dispatches to rrf', () => {
    const cfg: FusionConfig = { strategy: 'rrf', rrfK: 10 };
    const fused = applyFusion(vector, bm25, cfg);
    expect(fused).toHaveLength(2);
  });

  it('dispatches to weighted-sum with defaults', () => {
    const cfg: FusionConfig = { strategy: 'weighted-sum' };
    const fused = applyFusion(vector, bm25, cfg);
    expect(fused).toHaveLength(2);
  });

  it('dispatches to normalized with defaults', () => {
    const cfg: FusionConfig = { strategy: 'normalized' };
    const fused = applyFusion(vector, bm25, cfg);
    expect(fused).toHaveLength(2);
  });

  it('throws on unknown strategy', () => {
    const cfg = { strategy: 'bogus' } as unknown as FusionConfig;
    expect(() => applyFusion(vector, bm25, cfg)).toThrow('Unknown fusion strategy');
  });
});

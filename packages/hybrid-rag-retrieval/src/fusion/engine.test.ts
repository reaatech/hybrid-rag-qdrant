import type { RetrievalResult } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import { HybridRetrievalEngine } from './engine.js';

function vr(chunkId: string, score: number, source: 'vector' | 'bm25' = 'vector'): RetrievalResult {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    content: `the quick brown fox ${chunkId}`,
    score,
    source,
    metadata: {},
  };
}

describe('HybridRetrievalEngine', () => {
  it('fuses with config defaults and applies topK', () => {
    const engine = new HybridRetrievalEngine({
      fusion: { strategy: 'weighted-sum' },
      topK: 2,
    });
    const fused = engine.fuse([vr('a', 1), vr('b', 0.5)], [vr('c', 0.9, 'bm25')]);
    expect(fused.length).toBeLessThanOrEqual(2);
  });

  it('honors explicit weights and topK in fuse options', () => {
    const engine = new HybridRetrievalEngine({
      fusion: { strategy: 'weighted-sum', vectorWeight: 0.4, bm25Weight: 0.6 },
    });
    const fused = engine.fuse([vr('a', 1)], [vr('a', 1, 'bm25')], {
      topK: 1,
      vectorWeight: 0.5,
      bm25Weight: 0.5,
    });
    expect(fused).toHaveLength(1);
    expect(fused[0]!.score).toBeCloseTo(1, 6);
  });

  it('uses default vector/bm25 weight fallbacks (0.7/0.3)', () => {
    const engine = new HybridRetrievalEngine({ fusion: { strategy: 'weighted-sum' } });
    const fused = engine.fuse([vr('a', 1)], []);
    expect(fused[0]!.score).toBeCloseTo(0.7, 6);
  });

  it('reports no reranker by default', () => {
    const engine = new HybridRetrievalEngine({ fusion: { strategy: 'rrf' } });
    expect(engine.hasReranker()).toBe(false);
    expect(engine.getReranker()).toBeUndefined();
  });

  it('constructs a reranker when configured', () => {
    const engine = new HybridRetrievalEngine({
      fusion: { strategy: 'rrf' },
      reranker: { provider: 'local' },
    });
    expect(engine.hasReranker()).toBe(true);
    expect(engine.getReranker()).toBeDefined();
  });

  it('fuseAndRerank returns fused results when reranker disabled', async () => {
    const engine = new HybridRetrievalEngine({
      fusion: { strategy: 'rrf' },
      reranker: { provider: 'local' },
      topK: 2,
    });
    const out = await engine.fuseAndRerank(
      [vr('a', 1), vr('b', 0.9)],
      [vr('c', 0.8, 'bm25')],
      'quick fox',
      { useReranker: false },
    );
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it('fuseAndRerank reranks when reranker present and enabled', async () => {
    const engine = new HybridRetrievalEngine({
      fusion: { strategy: 'rrf' },
      reranker: { provider: 'local', finalK: 2 },
      topK: 2,
    });
    const out = await engine.fuseAndRerank(
      [vr('a', 1), vr('b', 0.9)],
      [vr('c', 0.8, 'bm25')],
      'quick fox',
    );
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it('fuseAndRerank without reranker configured returns fused slice', async () => {
    const engine = new HybridRetrievalEngine({ fusion: { strategy: 'rrf' }, topK: 1 });
    const out = await engine.fuseAndRerank([vr('a', 1)], [vr('b', 1, 'bm25')], 'q');
    expect(out).toHaveLength(1);
  });
});

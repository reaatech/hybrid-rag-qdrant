import type { VectorStoreConfig } from '@reaatech/hybrid-rag';
import { describe, expect, it, vi } from 'vitest';
import { benchmarkVectorStores, type DBBenchmarkQuery } from './db-benchmark.js';

interface FakeStoreOptions {
  provider: string;
  costPerQueryEstimate: number;
  results: { chunkId: string }[];
}

const createVectorStore = vi.hoisted(() => vi.fn());
vi.mock('@reaatech/hybrid-rag-retrieval', () => ({ createVectorStore }));

/** Minimal VectorStoreConfig stand-in; only `provider` is read by the benchmark. */
function cfg(provider: string): VectorStoreConfig {
  return { provider } as VectorStoreConfig;
}

function makeStore(opts: FakeStoreOptions) {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue(opts.results),
    costModel: { costPerQueryEstimate: opts.costPerQueryEstimate },
  };
}

describe('benchmarkVectorStores', () => {
  it('benchmarks multiple configs with metric parity for identical results', async () => {
    // Two stores returning the SAME perfect ranking should yield identical recall/ndcg.
    const perfect = [{ chunkId: 'c1' }, { chunkId: 'c2' }];
    createVectorStore
      .mockResolvedValueOnce(
        makeStore({ provider: 'qdrant', costPerQueryEstimate: 0.001, results: perfect }),
      )
      .mockResolvedValueOnce(
        makeStore({ provider: 'pgvector', costPerQueryEstimate: 0.002, results: perfect }),
      );

    const queries: DBBenchmarkQuery[] = [
      { query: 'q1', embedding: [0.1, 0.2], relevantChunkIds: ['c1', 'c2'] },
    ];

    const results = await benchmarkVectorStores([cfg('qdrant'), cfg('pgvector')], queries, {
      iterations: 2,
      warmupQueries: 1,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.provider).toBe('qdrant');
    expect(results[1]!.provider).toBe('pgvector');

    // Metric parity: same retrieval => same recall and ndcg
    expect(results[0]!.avgRecallAt10).toBeCloseTo(results[1]!.avgRecallAt10, 10);
    expect(results[0]!.avgNDCGAt10).toBeCloseTo(results[1]!.avgNDCGAt10, 10);

    // Perfect recall and ndcg
    expect(results[0]!.avgRecallAt10).toBeCloseTo(1, 10);
    expect(results[0]!.avgNDCGAt10).toBeCloseTo(1, 10);

    // Cost scales with the per-query estimate
    const totalQueries = queries.length * 2;
    expect(results[0]!.costPerQuery).toBe(0.001);
    expect(results[0]!.totalCost).toBeCloseTo(0.001 * totalQueries, 10);
    expect(results[1]!.totalCost).toBeCloseTo(0.002 * totalQueries, 10);
  });

  it('detects a worse provider via lower recall/ndcg', async () => {
    createVectorStore
      .mockResolvedValueOnce(
        makeStore({
          provider: 'good',
          costPerQueryEstimate: 0.001,
          results: [{ chunkId: 'c1' }, { chunkId: 'c2' }],
        }),
      )
      .mockResolvedValueOnce(
        makeStore({
          provider: 'bad',
          costPerQueryEstimate: 0.001,
          results: [{ chunkId: 'x1' }, { chunkId: 'x2' }],
        }),
      );

    const queries: DBBenchmarkQuery[] = [
      { query: 'q1', embedding: [0.1], relevantChunkIds: ['c1', 'c2'] },
    ];

    const [good, bad] = await benchmarkVectorStores([cfg('good'), cfg('bad')], queries, {
      iterations: 1,
      warmupQueries: 0,
    });

    expect(good!.avgRecallAt10).toBeGreaterThan(bad!.avgRecallAt10);
    expect(good!.avgNDCGAt10).toBeGreaterThan(bad!.avgNDCGAt10);
    expect(bad!.avgRecallAt10).toBe(0);
    expect(bad!.avgNDCGAt10).toBe(0);
  });

  it('skips queries without embeddings and handles empty relevant ids', async () => {
    createVectorStore.mockResolvedValueOnce(
      makeStore({ provider: 'qdrant', costPerQueryEstimate: 0, results: [{ chunkId: 'c1' }] }),
    );

    const queries: DBBenchmarkQuery[] = [
      { query: 'no-emb', relevantChunkIds: ['c1'] },
      { query: 'empty-rel', embedding: [0.5], relevantChunkIds: [] },
    ];

    const [result] = await benchmarkVectorStores([cfg('qdrant')], queries, { iterations: 1 });
    // empty relevant ids => recall contribution 0, ndcg 0
    expect(result!.avgRecallAt10).toBe(0);
    expect(result!.avgNDCGAt10).toBe(0);
  });

  it('uses default iteration and warmup options', async () => {
    const store = makeStore({
      provider: 'qdrant',
      costPerQueryEstimate: 0.001,
      results: [{ chunkId: 'c1' }],
    });
    createVectorStore.mockResolvedValueOnce(store);

    const queries: DBBenchmarkQuery[] = [
      { query: 'q', embedding: [0.1], relevantChunkIds: ['c1'] },
    ];
    const [result] = await benchmarkVectorStores([cfg('qdrant')], queries);
    expect(result!.provider).toBe('qdrant');
    expect(store.close).toHaveBeenCalled();
    // default 10 iterations on the single query
    expect(store.search).toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { EvaluationDataset } from '../dataset/loader.js';
import type { AblationConfig } from './config.js';
import { AblationRunner, type PipelineBuilderFn, runAblation } from './runner.js';

const writeFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ writeFileSync }));

vi.mock('@reaatech/hybrid-rag-observability', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeDataset(): EvaluationDataset {
  return {
    samples: [{ queryId: 'q1', query: 'q', relevantDocs: ['d1'], relevantChunks: ['c1'] }],
    metadata: { totalSamples: 1 },
  };
}

function makeConfig(): AblationConfig {
  return {
    baseline: {
      chunking: 'fixed-size',
      chunkSize: 512,
      overlap: 50,
      retrieval: 'hybrid',
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      reranker: 'cohere',
      topK: 10,
    },
    variants: [{ name: 'bigger-chunks', changes: { chunkSize: 1024 } }],
  };
}

describe('AblationRunner', () => {
  it('runs baseline and variants, computing deltas', async () => {
    writeFileSync.mockClear();
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const builder: PipelineBuilderFn = vi.fn(async (cfg) => ({
      // baseline retrieves the relevant chunk, variant retrieves nothing
      query: vi.fn(async () => (cfg.chunkSize === 512 ? [{ chunkId: 'c1' } as never] : [])),
      cleanup,
    }));

    const runner = new AblationRunner(makeConfig(), builder);
    const results = await runner.run(makeDataset(), '/tmp/ablation.json');

    expect(builder).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(results.variants).toHaveLength(1);
    expect(results.baseline.metrics.precisionAtK).toBeGreaterThan(0);
    // variant retrieved nothing => negative delta
    expect(results.variants[0]!.delta.ndcgAtK).toBeLessThanOrEqual(0);
    expect(results.variants[0]!.executionTime).toBeGreaterThanOrEqual(0);
    // baseline + variant EvaluationRunner writes (default path) + ablation output
    expect(writeFileSync).toHaveBeenCalledWith('/tmp/ablation.json', expect.any(String));
  });

  it('does not write the ablation output when no output path provided', async () => {
    writeFileSync.mockClear();
    const builder: PipelineBuilderFn = vi.fn(async () => ({
      query: vi.fn(async () => []),
      cleanup: vi.fn().mockResolvedValue(undefined),
    }));
    const runner = new AblationRunner(makeConfig(), builder);
    await runner.run(makeDataset());
    // inner EvaluationRunner still writes its default file, but no ablation.json
    expect(writeFileSync.mock.calls.some((c) => String(c[0]).includes('ablation'))).toBe(false);
  });

  it('cleans up the baseline pipeline even if evaluation throws', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const builder: PipelineBuilderFn = vi.fn(async () => ({
      query: vi.fn(async () => {
        throw new Error('retrieval failed');
      }),
      cleanup,
    }));
    const runner = new AblationRunner(makeConfig(), builder);
    await expect(runner.run(makeDataset())).rejects.toThrow('retrieval failed');
    expect(cleanup).toHaveBeenCalled();
  });

  it('merges variant changes over the baseline config', async () => {
    writeFileSync.mockClear();
    const seenConfigs: number[] = [];
    const builder: PipelineBuilderFn = vi.fn(async (cfg) => {
      seenConfigs.push(cfg.chunkSize);
      return {
        query: vi.fn(async () => []),
        cleanup: vi.fn().mockResolvedValue(undefined),
      };
    });
    const runner = new AblationRunner(makeConfig(), builder);
    await runner.run(makeDataset());
    expect(seenConfigs).toEqual([512, 1024]);
  });
});

describe('runAblation', () => {
  it('runs through the convenience wrapper', async () => {
    writeFileSync.mockClear();
    const builder: PipelineBuilderFn = vi.fn(async () => ({
      query: vi.fn(async () => [{ chunkId: 'c1' } as never]),
      cleanup: vi.fn().mockResolvedValue(undefined),
    }));
    const results = await runAblation(makeConfig(), makeDataset(), builder);
    expect(results.summary.totalVariants).toBe(1);
  });
});

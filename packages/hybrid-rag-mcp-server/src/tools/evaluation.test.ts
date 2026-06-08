import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  evaluationTools,
  ragAblation,
  ragBenchmark,
  ragBenchmarkDb,
  ragEvaluate,
} from './evaluation.js';

const { benchmarkVectorStores } = vi.hoisted(() => ({ benchmarkVectorStores: vi.fn() }));
vi.mock('@reaatech/hybrid-rag-evaluation', () => ({
  benchmarkVectorStores: (...args: unknown[]) => benchmarkVectorStores(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('evaluationTools registry', () => {
  it('exports four tools', () => {
    expect(evaluationTools.map((t) => t.name)).toEqual([
      'rag.evaluate',
      'rag.ablation',
      'rag.benchmark',
      'rag.benchmark_db',
    ]);
  });
});

describe('rag.evaluate', () => {
  it('echoes dataset args (stub)', async () => {
    const res = await ragEvaluate.handler(
      { datasetPath: '/data.jsonl', metrics: ['mrr'], topK: 5 },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.datasetPath).toBe('/data.jsonl');
    expect(payload.topK).toBe(5);
  });
});

describe('rag.ablation', () => {
  it('echoes config args (stub)', async () => {
    const res = await ragAblation.handler(
      { configPath: '/cfg.yaml', datasetPath: '/d.jsonl' },
      makePipeline({}),
    );
    expect(parseToolResult(res).configPath).toBe('/cfg.yaml');
  });
});

describe('rag.benchmark', () => {
  it('echoes benchmark args (stub)', async () => {
    const res = await ragBenchmark.handler(
      { queriesPath: '/q.jsonl', warmupQueries: 2, testQueries: 20, concurrency: [1, 2] },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.queriesPath).toBe('/q.jsonl');
    expect(payload.concurrency).toEqual([1, 2]);
  });
});

describe('rag.benchmark_db', () => {
  const validConfig = {
    provider: 'qdrant',
    url: 'http://localhost:6333',
    collectionName: 'documents',
    vectorSize: 128,
  };

  it('validates configs and delegates to the evaluation package', async () => {
    benchmarkVectorStores.mockResolvedValue({ qdrant: { p50: 12 } });
    const res = await ragBenchmarkDb.handler(
      {
        configs: [validConfig],
        queries: [{ query: 'hi', relevantChunkIds: ['c1'] }],
        iterations: 3,
      },
      makePipeline({}),
    );
    expect(parseToolResult(res)).toEqual({ qdrant: { p50: 12 } });
    expect(benchmarkVectorStores).toHaveBeenCalledWith(
      [validConfig],
      [{ query: 'hi', relevantChunkIds: ['c1'] }],
      { iterations: 3 },
    );
  });

  it('defaults iterations to 10 when omitted', async () => {
    benchmarkVectorStores.mockResolvedValue({});
    await ragBenchmarkDb.handler(
      { configs: [validConfig], queries: [{ query: 'q', relevantChunkIds: [] }] },
      makePipeline({}),
    );
    expect(benchmarkVectorStores.mock.calls[0][2]).toEqual({ iterations: 10 });
  });

  it('errors on invalid vector store config', async () => {
    const res = await ragBenchmarkDb.handler(
      { configs: [{ provider: 'not-a-provider' }], queries: [] },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(typeof parseToolResult(res).error).toBe('string');
  });

  it('surfaces a friendly message when the evaluation package is missing', async () => {
    const err = new Error('missing') as Error & { code?: string };
    err.code = 'ERR_MODULE_NOT_FOUND';
    benchmarkVectorStores.mockRejectedValue(err);
    const res = await ragBenchmarkDb.handler(
      { configs: [validConfig], queries: [{ query: 'q', relevantChunkIds: [] }] },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('Evaluation package not installed');
  });

  it('surfaces generic errors from the benchmark', async () => {
    benchmarkVectorStores.mockRejectedValue(new Error('benchmark blew up'));
    const res = await ragBenchmarkDb.handler(
      { configs: [validConfig], queries: [{ query: 'q', relevantChunkIds: [] }] },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('benchmark blew up');
  });
});

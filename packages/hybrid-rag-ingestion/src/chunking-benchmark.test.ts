import type { Document, EvaluationSample } from '@reaatech/hybrid-rag';
import { ChunkingStrategy } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import { ChunkingBenchmark } from './chunking-benchmark.js';

const docs: Document[] = [
  { id: 'a', content: 'The quick brown fox. '.repeat(40), source: 'a.txt' },
  { id: 'b', content: 'Lorem ipsum dolor sit amet. '.repeat(40), source: 'b.txt' },
] as unknown as Document[];

describe('ChunkingBenchmark.benchmark', () => {
  it('benchmarks all strategies by default', () => {
    const bench = new ChunkingBenchmark();
    const result = bench.benchmark(docs);
    expect(result.strategies.length).toBe(Object.values(ChunkingStrategy).length);
    expect(result.documentCount).toBe(2);
    expect(result.bestStrategy.metric).toBe('totalChunks');
    expect(result.bestStrategy.value).toBeGreaterThan(0);
    expect(typeof result.timestamp).toBe('string');
    for (const s of result.strategies) {
      expect(s.chunkingStats.totalChunks).toBeGreaterThanOrEqual(0);
    }
  });

  it('benchmarks a custom subset of strategies with options', () => {
    const bench = new ChunkingBenchmark();
    const result = bench.benchmark(docs, {
      strategies: [ChunkingStrategy.FIXED_SIZE],
      chunkSize: 64,
      overlap: 8,
    });
    expect(result.strategies).toHaveLength(1);
    expect(result.strategies[0]?.config.chunkSize).toBe(64);
  });

  it('handles empty document list with zeroed stats', () => {
    const bench = new ChunkingBenchmark();
    const result = bench.benchmark([], { strategies: [ChunkingStrategy.FIXED_SIZE] });
    expect(result.documentCount).toBe(0);
    expect(result.strategies[0]?.chunkingStats.avgChunkSize).toBe(0);
    expect(result.strategies[0]?.chunkingStats.minChunkSize).toBe(0);
    expect(result.strategies[0]?.chunkingStats.maxChunkSize).toBe(0);
  });
});

describe('ChunkingBenchmark.benchmarkWithEvaluation', () => {
  it('runs the base benchmark and logs a warning about retrieval metrics', () => {
    const bench = new ChunkingBenchmark();
    const samples: EvaluationSample[] = [] as unknown as EvaluationSample[];
    const result = bench.benchmarkWithEvaluation(docs, samples, {
      strategies: [ChunkingStrategy.RECURSIVE],
    });
    expect(result.strategies).toHaveLength(1);
  });
});

describe('ChunkingBenchmark formatters', () => {
  it('formats as a markdown table', () => {
    const bench = new ChunkingBenchmark();
    const result = bench.benchmark(docs, { strategies: [ChunkingStrategy.FIXED_SIZE] });
    const md = ChunkingBenchmark.formatAsMarkdown(result);
    expect(md).toContain('# Chunking Strategy Benchmark Results');
    expect(md).toContain('| Strategy |');
    expect(md).toContain(ChunkingStrategy.FIXED_SIZE);
  });

  it('formats as JSON', () => {
    const bench = new ChunkingBenchmark();
    const result = bench.benchmark(docs, { strategies: [ChunkingStrategy.FIXED_SIZE] });
    const json = ChunkingBenchmark.formatAsJson(result);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json).documentCount).toBe(2);
  });
});

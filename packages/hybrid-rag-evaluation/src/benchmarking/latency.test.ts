import { describe, expect, it, vi } from 'vitest';
import { benchmarkComponentLatency, benchmarkLatency, calculateLatencyStats } from './latency.js';

describe('calculateLatencyStats', () => {
  it('returns zeroes for empty input', () => {
    const stats = calculateLatencyStats([]);
    expect(stats).toEqual({
      latencies: [],
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      mean: 0,
      stdDev: 0,
      min: 0,
      max: 0,
    });
  });

  it('computes percentiles, mean, stddev, min and max', () => {
    const stats = calculateLatencyStats([10, 20, 30, 40, 50]);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(50);
    expect(stats.mean).toBe(30);
    expect(stats.p50).toBe(30);
    expect(stats.p90).toBe(50);
    expect(stats.p99).toBe(50);
    expect(stats.stdDev).toBeGreaterThan(0);
  });
});

describe('benchmarkLatency', () => {
  it('runs warmup then test queries and records latencies', async () => {
    const queries = ['q1', 'q2', 'q3', 'q4'];
    const fn = vi.fn().mockResolvedValue(undefined);
    const result = await benchmarkLatency(queries, fn, { warmupQueries: 1, testQueries: 3 });
    expect(fn).toHaveBeenCalledTimes(4); // 1 warmup + 3 test
    expect(result.latencies).toHaveLength(3);
  });

  it('defaults warmup to 10 (capped by query count) leaving no test queries', async () => {
    const queries = ['q1', 'q2'];
    const fn = vi.fn().mockResolvedValue(undefined);
    const result = await benchmarkLatency(queries, fn);
    expect(result.latencies).toHaveLength(0);
  });
});

describe('benchmarkComponentLatency', () => {
  it('benchmarks each component with warmup and test phases', async () => {
    const queries = ['a', 'b', 'c'];
    const fnA = vi.fn().mockResolvedValue(undefined);
    const fnB = vi.fn().mockResolvedValue(undefined);
    const results = await benchmarkComponentLatency(
      queries,
      [
        { name: 'vector', fn: fnA },
        { name: 'bm25', fn: fnB },
      ],
      { warmupQueries: 1 },
    );
    expect(results.vector.latencies).toHaveLength(3);
    expect(results.bm25.latencies).toHaveLength(3);
    expect(fnA).toHaveBeenCalledTimes(4); // 1 warmup + 3 test
  });

  it('uses default warmup of 5', async () => {
    const queries = ['a'];
    const fn = vi.fn().mockResolvedValue(undefined);
    const results = await benchmarkComponentLatency(queries, [{ name: 'c', fn }]);
    expect(results.c.latencies).toHaveLength(1);
  });
});

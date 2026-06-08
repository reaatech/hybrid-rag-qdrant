import { describe, expect, it, vi } from 'vitest';
import { benchmarkThroughput } from './throughput.js';

vi.mock('@reaatech/hybrid-rag-observability', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('benchmarkThroughput', () => {
  it('runs at each concurrency level and returns results', async () => {
    const queries = ['q1', 'q2', 'q3', 'q4'];
    const fn = vi.fn().mockResolvedValue(undefined);

    const results = await benchmarkThroughput(queries, fn, {
      concurrency: [1, 2],
      queriesPerLevel: 4,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.concurrency).toBe(1);
    expect(results[1]!.concurrency).toBe(2);
    for (const r of results) {
      expect(r.totalQueries).toBe(4);
      expect(r.qps).toBeGreaterThanOrEqual(0);
      expect(r.totalTime).toBeGreaterThanOrEqual(0);
    }
    // 4 queries * 2 concurrency levels
    expect(fn).toHaveBeenCalledTimes(8);
  });

  it('caps executed queries to the available query count', async () => {
    const queries = ['q1', 'q2'];
    const fn = vi.fn().mockResolvedValue(undefined);
    const results = await benchmarkThroughput(queries, fn, {
      concurrency: [3],
      queriesPerLevel: 100,
    });
    expect(results[0]!.totalQueries).toBe(2);
  });

  it('exercises the semaphore queue when concurrency is below the workload', async () => {
    const queries = Array.from({ length: 6 }, (_, i) => `q${i}`);
    let active = 0;
    let maxActive = 0;
    const fn = vi.fn().mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
    });
    const results = await benchmarkThroughput(queries, fn, {
      concurrency: [2],
      queriesPerLevel: 6,
    });
    expect(results[0]!.totalQueries).toBe(6);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});

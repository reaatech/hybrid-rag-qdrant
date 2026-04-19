/**
 * Latency benchmarking
 */

/**
 * Latency measurement result
 */
export interface LatencyResult {
  /** Latency measurements in milliseconds */
  latencies: number[];
  /** P50 latency */
  p50: number;
  /** P90 latency */
  p90: number;
  /** P95 latency */
  p95: number;
  /** P99 latency */
  p99: number;
  /** Mean latency */
  mean: number;
  /** Standard deviation */
  stdDev: number;
  /** Min latency */
  min: number;
  /** Max latency */
  max: number;
}

/**
 * Query function type for benchmarking
 */
export type BenchmarkQueryFn = (query: string) => Promise<void>;

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

/**
 * Calculate statistics from latency measurements
 */
export function calculateLatencyStats(latencies: number[]): LatencyResult {
  if (latencies.length === 0) {
    return {
      latencies: [],
      p50: 0, p90: 0, p95: 0, p99: 0,
      mean: 0, stdDev: 0, min: 0, max: 0,
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const variance = latencies.reduce((sum, l) => sum + (l - mean) ** 2, 0) / latencies.length;
  const stdDev = Math.sqrt(variance);

  return {
    latencies,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean,
    stdDev,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

/**
 * Run latency benchmark
 */
export async function benchmarkLatency(
  queries: string[],
  queryFn: BenchmarkQueryFn,
  options?: {
    warmupQueries?: number;
    testQueries?: number;
  },
): Promise<LatencyResult> {
  const warmupQueries = options?.warmupQueries ?? 10;
  const testQueries = options?.testQueries ?? queries.length;

  const latencies: number[] = [];

  // Warmup phase
  for (let i = 0; i < Math.min(warmupQueries, queries.length); i++) {
    await queryFn(queries[i]!);
  }

  // Test phase
  const testStart = Math.min(warmupQueries, queries.length);
  const testEnd = Math.min(testStart + testQueries, queries.length);
  for (let i = testStart; i < testEnd; i++) {
    const start = performance.now();
    await queryFn(queries[i]!);
    const end = performance.now();
    latencies.push(end - start);
  }

  return calculateLatencyStats(latencies);
}

/**
 * Run component-level latency benchmark
 */
export async function benchmarkComponentLatency(
  queries: string[],
  components: {
    name: string;
    fn: (query: string) => Promise<void>;
  }[],
  options?: { warmupQueries?: number },
): Promise<Record<string, LatencyResult>> {
  const warmupQueries = options?.warmupQueries ?? 5;
  const results: Record<string, LatencyResult> = {};

  for (const component of components) {
    const latencies: number[] = [];

    // Warmup
    for (let i = 0; i < Math.min(warmupQueries, queries.length); i++) {
      await component.fn(queries[i]!);
    }

    // Test
    for (const query of queries) {
      const start = performance.now();
      await component.fn(query);
      const end = performance.now();
      latencies.push(end - start);
    }

    results[component.name] = calculateLatencyStats(latencies);
  }

  return results;
}

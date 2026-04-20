/**
 * Throughput benchmarking
 */

import { getLogger } from '../observability/logger.js';

const logger = getLogger();

/**
 * Throughput benchmark result
 */
export interface ThroughputResult {
  /** Queries per second */
  qps: number;
  /** Total queries executed */
  totalQueries: number;
  /** Total time in milliseconds */
  totalTime: number;
  /** Concurrent requests tested */
  concurrency: number;
}

/**
 * Throughput benchmark configuration
 */
export interface ThroughputConfig {
  /** Concurrency levels to test */
  concurrency: number[];
  /** Number of queries per concurrency level */
  queriesPerLevel: number;
  /** Maximum time per test (ms) */
  maxTime?: number;
}

/**
 * Query function type for throughput testing
 */
export type ThroughputQueryFn = (query: string) => Promise<void>;

/**
 * Run throughput benchmark at a specific concurrency level
 */
async function runConcurrencyTest(
  queries: string[],
  queryFn: ThroughputQueryFn,
  concurrency: number,
  maxQueries: number,
): Promise<ThroughputResult> {
  const startTime = performance.now();
  let completedQueries = 0;
  const semaphore = new Semaphore(concurrency);

  const promises: Promise<void>[] = [];

  for (let i = 0; i < Math.min(maxQueries, queries.length); i++) {
    await semaphore.acquire();

    promises.push(
      queryFn(queries[i]!).finally(() => {
        completedQueries++;
        semaphore.release();
      }),
    );
  }

  await Promise.all(promises);
  const totalTime = performance.now() - startTime;

  return {
    qps: (completedQueries / totalTime) * 1000,
    totalQueries: completedQueries,
    totalTime,
    concurrency,
  };
}

/**
 * Run throughput benchmark across multiple concurrency levels
 */
export async function benchmarkThroughput(
  queries: string[],
  queryFn: ThroughputQueryFn,
  config: ThroughputConfig,
): Promise<ThroughputResult[]> {
  const results: ThroughputResult[] = [];

  for (const concurrency of config.concurrency) {
    logger.info(`Testing concurrency level: ${concurrency}...`);
    const result = await runConcurrencyTest(queries, queryFn, concurrency, config.queriesPerLevel);
    results.push(result);
  }

  return results;
}

/**
 * Simple semaphore for concurrency control
 */
class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

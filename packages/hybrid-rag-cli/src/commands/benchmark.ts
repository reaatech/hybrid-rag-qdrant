/**
 * Benchmark Command
 */

import { writeFile } from 'node:fs/promises';
import {
  benchmarkLatency,
  benchmarkThroughput,
  getEnvironmentInfo,
} from '@reaatech/hybrid-rag-evaluation';
import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

export interface BenchmarkOptions {
  output: string;
  queries: number;
  iterations: number;
  qdrantUrl: string;
  collection: string;
}

export async function benchmarkCommand(
  _configPath: string,
  options: BenchmarkOptions,
  pipeline: RAGPipeline,
): Promise<void> {
  console.log('Running benchmark...');
  console.log(`  Queries: ${options.queries}`);
  console.log(`  Iterations: ${options.iterations}`);

  const testQueries = [
    'How do I reset my password?',
    'What are the system requirements?',
    'How do I configure SSO?',
    'What is the refund policy?',
    'How do I contact support?',
  ];

  const queryFn = async (q: string): Promise<void> => {
    try {
      await pipeline.query(q, { topK: 5 });
    } catch (error) {
      console.error(`Query failed: ${q}`, error);
    }
  };

  console.log('  Running latency benchmark...');
  const latencyResults = await benchmarkLatency(testQueries, queryFn);

  console.log('  Running throughput benchmark...');
  const throughputResults = await benchmarkThroughput(testQueries, queryFn, {
    concurrency: [1, 5],
    queriesPerLevel: 10,
  });

  const output = {
    benchmark: {
      queries: options.queries,
      iterations: options.iterations,
      timestamp: new Date().toISOString(),
    },
    latency: {
      avg_ms: Math.round(latencyResults.mean * 100) / 100,
      p50_ms: Math.round(latencyResults.p50 * 100) / 100,
      p95_ms: Math.round(latencyResults.p95 * 100) / 100,
      p99_ms: Math.round(latencyResults.p99 * 100) / 100,
      min_ms: Math.round(latencyResults.min * 100) / 100,
      max_ms: Math.round(latencyResults.max * 100) / 100,
    },
    throughput: throughputResults[0]
      ? {
          queries_per_second: throughputResults[0].qps,
        }
      : { queries_per_second: 0 },
    environment: getEnvironmentInfo(),
  };

  await writeFile(options.output, JSON.stringify(output, null, 2));

  console.log('\nBenchmark Results:');
  console.log(`  Average Latency: ${latencyResults.mean.toFixed(2)}ms`);
  console.log(`  P50 Latency: ${latencyResults.p50.toFixed(2)}ms`);
  console.log(`  P95 Latency: ${latencyResults.p95.toFixed(2)}ms`);
  console.log(`  P99 Latency: ${latencyResults.p99.toFixed(2)}ms`);
  console.log(`\nResults saved to: ${options.output}`);
}

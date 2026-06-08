import type { VectorStoreConfig } from '@reaatech/hybrid-rag';
import { createVectorStore } from '@reaatech/hybrid-rag-retrieval';
import { calculateLatencyStats } from './latency.js';

export interface DBBenchmarkResult {
  provider: string;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputQPS: number;
  avgRecallAt10: number;
  avgNDCGAt10: number;
  totalCost: number;
  costPerQuery: number;
}

export interface DBBenchmarkQuery {
  query: string;
  embedding?: number[];
  relevantChunkIds: string[];
}

export interface DBBenchmarkOptions {
  iterations?: number;
  warmupQueries?: number;
}

export async function benchmarkVectorStores(
  configs: VectorStoreConfig[],
  queries: DBBenchmarkQuery[],
  options?: DBBenchmarkOptions,
): Promise<DBBenchmarkResult[]> {
  const iterations = options?.iterations ?? 10;
  const warmupQueries = options?.warmupQueries ?? 5;
  const results: DBBenchmarkResult[] = [];

  for (const config of configs) {
    const store = await createVectorStore(config);
    await store.initialize();

    for (let i = 0; i < Math.min(warmupQueries, queries.length); i++) {
      const emb = queries[i]!.embedding;
      if (emb) {
        await store.search({ vector: emb, topK: 10 });
      }
    }

    const latencies: number[] = [];
    let totalRecall = 0;
    let totalNDCG = 0;

    for (const q of queries) {
      if (!q.embedding) continue;
      for (let iter = 0; iter < iterations; iter++) {
        const start = performance.now();
        const searchResults = await store.search({
          vector: q.embedding,
          topK: 10,
        });
        const end = performance.now();
        latencies.push(end - start);

        const retrievedIds = searchResults.map((r) => r.chunkId);
        const relevant = q.relevantChunkIds;
        const hits = retrievedIds.filter((id) => relevant.includes(id)).length;
        totalRecall += relevant.length > 0 ? hits / Math.min(relevant.length, 10) : 0;

        totalNDCG += ndcgAtK(retrievedIds, relevant, 10);
      }
    }

    const latencyStats = calculateLatencyStats(latencies);
    const totalQueries = queries.length * iterations;
    const totalLatencyMs = latencies.reduce((a, b) => a + b, 0);
    const throughputQPS = totalLatencyMs > 0 ? (totalQueries / totalLatencyMs) * 1000 : 0;

    results.push({
      provider: config.provider,
      avgLatencyMs: latencyStats.mean,
      p50LatencyMs: latencyStats.p50,
      p95LatencyMs: latencyStats.p95,
      p99LatencyMs: latencyStats.p99,
      throughputQPS,
      avgRecallAt10: totalRecall / totalQueries,
      avgNDCGAt10: totalNDCG / totalQueries,
      totalCost: store.costModel.costPerQueryEstimate * totalQueries,
      costPerQuery: store.costModel.costPerQueryEstimate,
    });

    await store.close();
  }

  return results;
}

function ndcgAtK(retrieved: string[], relevant: string[], k: number): number {
  const idcg = idealDCG(relevant.slice(0, k));
  if (idcg === 0) return 0;
  return dcgAtK(retrieved, relevant, k) / idcg;
}

function dcgAtK(retrieved: string[], relevant: string[], k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(retrieved.length, k); i++) {
    const rel = relevant.includes(retrieved[i]!) ? 1 : 0;
    dcg += rel / Math.log2(i + 2);
  }
  return dcg;
}

function idealDCG(relevant: string[]): number {
  let idcg = 0;
  for (let i = 0; i < relevant.length; i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg;
}

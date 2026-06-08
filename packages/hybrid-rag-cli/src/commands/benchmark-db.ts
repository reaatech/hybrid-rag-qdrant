import { readFile, writeFile } from 'node:fs/promises';
import type { VectorStoreConfig } from '@reaatech/hybrid-rag';
import { validateVectorStoreConfig } from '@reaatech/hybrid-rag';

export interface BenchmarkDbOptions {
  configs: string;
  queries: string;
  iterations: number | string;
  output: string;
}

export async function benchmarkDbCommand(options: BenchmarkDbOptions): Promise<void> {
  if (!options.configs) {
    throw new Error('--configs is required');
  }

  const configPaths = options.configs.split(',').map((s) => s.trim());
  const configs: VectorStoreConfig[] = [];

  for (const configPath of configPaths) {
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    configs.push(validateVectorStoreConfig(parsed));
  }

  let queries: Array<{ query: string; relevantChunkIds: string[] }> = [];
  if (options.queries) {
    const queryContent = await readFile(options.queries, 'utf-8');
    queries = JSON.parse(queryContent);
  }

  const iterations = Number.parseInt(String(options.iterations ?? 10), 10);

  console.log(`Benchmarking ${configs.length} vector store configurations...`);
  console.log(`  Queries: ${queries.length}`);
  console.log(`  Iterations: ${iterations}`);

  const { benchmarkVectorStores } = await import('@reaatech/hybrid-rag-evaluation');
  const results = await benchmarkVectorStores(configs, queries, { iterations });

  const outputPath = options.output || 'benchmark-db-results.json';
  await writeFile(outputPath, JSON.stringify(results, null, 2));

  console.log('\nBenchmark Results:');
  for (const result of results) {
    console.log(`  ${result.provider}:`);
    console.log(`    Avg Latency: ${result.avgLatencyMs.toFixed(2)}ms`);
    console.log(`    P95 Latency: ${result.p95LatencyMs.toFixed(2)}ms`);
    console.log(`    Throughput: ${result.throughputQPS.toFixed(2)} qps`);
    console.log(`    Recall@10: ${result.avgRecallAt10.toFixed(4)}`);
    console.log(`    Cost/Query: $${result.costPerQuery.toFixed(6)}`);
  }

  console.log(`\nResults saved to: ${outputPath}`);
}

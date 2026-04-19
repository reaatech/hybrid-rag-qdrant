# Benchmarking

## Capability
Performance benchmarking for latency, throughput, and cost.

## Metrics Tracked

| Category | Metrics |
|----------|---------|
| **Latency** | P50, P90, P95, P99, mean, std |
| **Throughput** | Queries/sec, concurrent handling |
| **Cost** | Per-component breakdown, total/query |
| **Resource** | Memory usage, CPU utilization |

## Usage

```typescript
import { BenchmarkRunner } from 'hybrid-rag-qdrant';

const runner = new BenchmarkRunner({
  warmupQueries: 50,
  testQueries: 500,
  concurrency: [1, 5, 10, 50],
});

const results = await runner.benchmark({
  pipeline: ragPipeline,
  queries: testQueries,
});

console.log(results.latency);
// { p50: 245, p90: 630, p95: 890, p99: 1270 }
```

## Latency Breakdown

```typescript
console.log(results.componentLatency);
// {
//   embedding: { p50: 200, p90: 500, p99: 1000 },
//   vectorSearch: { p50: 50, p90: 100, p99: 200 },
//   bm25Search: { p50: 10, p90: 20, p99: 50 },
//   fusion: { p50: 5, p90: 10, p99: 20 },
//   reranking: { p50: 500, p90: 1000, p99: 2000 },
// }
```

## Cost Breakdown

```typescript
console.log(results.cost);
// {
//   embedding: 0.002,
//   vectorSearch: 0.001,
//   reranking: 0.01,
//   total: 0.013,
// }
```

## Throughput Testing

```typescript
const throughput = await runner.benchmarkThroughput({
  pipeline: ragPipeline,
  queries: largeQuerySet,
  maxConcurrency: 100,
});

console.log(throughput.results);
// [
//   { concurrency: 1, qps: 4.2 },
//   { concurrency: 5, qps: 18.5 },
//   { concurrency: 10, qps: 32.1 },
//   { concurrency: 50, qps: 89.3 },
// ]
```

## Export Results

```typescript
await runner.export(results, {
  format: 'json',
  outputPath: './benchmark-results.json',
  includeRawData: true,
});
```

## CLI Usage

```bash
# Full benchmark
npx hybrid-rag-qdrant benchmark \
  --queries queries.jsonl \
  --concurrency 1,5,10,50 \
  --warmup 50 \
  --test-queries 500 \
  --output benchmark-results.json

# Latency only
npx hybrid-rag-qdrant benchmark latency \
  --queries queries.jsonl \
  --output latency-results.json

# Cost only
npx hybrid-rag-qdrant benchmark cost \
  --queries queries.jsonl \
  --output cost-results.json
```

## Target Performance

| Metric | Target |
|--------|--------|
| P50 latency (no rerank) | < 300ms |
| P90 latency (no rerank) | < 700ms |
| P99 latency (no rerank) | < 1500ms |
| Cost per query (no rerank) | < $0.005 |
| Throughput (single instance) | > 50 qps |

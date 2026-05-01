# @reaatech/hybrid-rag-evaluation

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-evaluation.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-evaluation)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Evaluation runner, ablation studies, and performance benchmarking for hybrid RAG systems. Provides standard IR metrics, component contribution analysis, and latency/throughput/cost measurement.

## Installation

```bash
npm install @reaatech/hybrid-rag-evaluation
# or
pnpm add @reaatech/hybrid-rag-evaluation
```

## Feature Overview

- **Standard IR metrics** — Precision@K, Recall@K, NDCG@K, MAP, MRR with per-query and aggregate results
- **Generation metrics** — Relevance, fluency, coherence, faithfulness, answer correctness scoring
- **Ablation studies** — YAML-configurable variant testing with delta comparisons and cost tracking
- **Dataset management** — load `.jsonl` datasets, split into train/test, generate synthetic datasets
- **Performance benchmarking** — latency percentiles, throughput, cost breakdown, environment capture
- **Markdown reporting** — auto-generated benchmark and ablation reports

## Quick Start

### Evaluation

```typescript
import { EvaluationRunner, loadEvaluationDataset } from '@reaatech/hybrid-rag-evaluation';

const dataset = await loadEvaluationDataset('./datasets/eval.jsonl');

const runner = new EvaluationRunner({
  topK: 10,
  metrics: ['precision', 'recall', 'ndcg', 'map', 'mrr'],
});

const results = await runner.evaluate(dataset, async (query) => {
  return pipeline.query(query);
});

console.log(`NDCG@10: ${results.summary.ndcgAtK}`);
console.log(`MAP: ${results.summary.map}`);
console.log(`MRR: ${results.summary.mrr}`);
```

### Ablation Study

```typescript
import { AblationRunner } from '@reaatech/hybrid-rag-evaluation';

const config = {
  baseline: {
    chunking: 'fixed-size',
    chunkSize: 512,
    overlap: 50,
    retrieval: 'hybrid',
    vectorWeight: 0.7,
    bm25Weight: 0.3,
    reranker: 'cohere',
    topK: 10,
  },
  variants: [
    { name: 'no-reranker', changes: { reranker: null } },
    { name: 'vector-only', changes: { retrieval: 'vector' } },
    { name: 'bm25-only', changes: { retrieval: 'bm25' } },
  ],
};

const results = await AblationRunner.run(config, dataset, async (pipelineConfig) => {
  const pipeline = new RAGPipeline(pipelineConfig);
  await pipeline.initialize();
  return async (query) => pipeline.query(query);
});
```

### Benchmarking

```typescript
import { benchmarkLatency, benchmarkThroughput } from '@reaatech/hybrid-rag-evaluation';

const latencyResult = await benchmarkLatency({
  queries: ['How do I...', 'What is...', /* ... */],
  queryFn: async (q) => pipeline.query(q),
  warmupQueries: 5,
  iterations: 50,
});

console.log(`P50: ${latencyResult.p50}ms, P99: ${latencyResult.p99}ms`);

const throughputResult = await benchmarkThroughput({
  queries: loadQueries(),
  queryFn: async (q) => pipeline.query(q),
  concurrentQueries: 10,
});
```

## API Reference

### Evaluation

#### `EvaluationRunner`

| Constructor Option | Type | Default | Description |
|--------------------|------|---------|-------------|
| `topK` | `number` | `10` | K value for @K metrics |
| `metrics` | `string[]` | `['precision','recall','ndcg','map','mrr']` | Metrics to compute |

| Method | Returns | Description |
|--------|---------|-------------|
| `evaluate(dataset, queryFn)` | `EvaluationResults` | Run evaluation on all samples |
| `runEvaluation(dataset, queryFn, config?)` | `EvaluationResults` | Alias for evaluate |

#### Retrieval Metrics

| Function | Description |
|----------|-------------|
| `precisionAtK(retrieved, relevant, k)` | Fraction of retrieved items that are relevant |
| `recallAtK(retrieved, relevant, k)` | Fraction of relevant items that were retrieved |
| `ndcgAtK(retrieved, relevant, k)` | Normalized Discounted Cumulative Gain |
| `dcgAtK(retrieved, relevant, k)` | Discounted Cumulative Gain |
| `idcgAtK(relevant, k)` | Ideal DCG |
| `averagePrecision(retrieved, relevant)` | Mean of precision at each relevant position |
| `reciprocalRank(retrieved, relevant)` | 1 / rank of first relevant item |
| `evaluateQuery(retrieved, relevant, config)` | Compute all metrics for a single query |
| `aggregateMetrics(perQueryResults)` | Aggregate per-query results into summary |

#### Generation Metrics

| Function | Description |
|----------|-------------|
| `relevanceScore(generated, query)` | How relevant the answer is to the query |
| `fluencyScore(generated)` | Grammatical correctness and readability |
| `coherenceScore(generated)` | Logical flow and consistency |
| `faithfulnessScore(generated, source)` | How well the answer adheres to source material |
| `answerCorrectnessScore(generated, ideal)` | Factual correctness against ground truth |
| `evaluateGeneration(generated, query, config)` | Compute all generation metrics |
| `aggregateGenerationMetrics(results)` | Aggregate per-query generation results |

### Ablation Studies

#### `AblationRunner`

| Static Method | Description |
|---------------|-------------|
| `run(config, dataset, builderFn)` | Execute full ablation study |
| `runAblation(config, dataset, builderFn)` | Alias for run |

#### Config Format (YAML)

```yaml
baseline:
  chunking: fixed-size
  chunk_size: 512
  overlap: 50
  retrieval: hybrid
  vector_weight: 0.7
  bm25_weight: 0.3
  reranker: cohere
  top_k: 10

variants:
  - name: no-reranker
    description: "Skip reranking step"
    changes:
      reranker: null

  - name: semantic-chunking
    changes:
      chunking: semantic
```

#### Reporter

| Function | Description |
|----------|-------------|
| `generateMarkdownTable(results)` | Render results as a Markdown table |
| `generateSummary(results)` | One-line summary of best/worst variants |
| `sortByNDCG(results)` | Sort variants by NDCG descending |
| `sortByDelta(results)` | Sort variants by delta vs baseline |

### Benchmarking

#### Latency

| Function | Description |
|----------|-------------|
| `benchmarkLatency(options)` | Measure per-query latency with warmup |
| `benchmarkComponentLatency(options)` | Measure latency per pipeline component |
| `calculateLatencyStats(latencies)` | Compute p50/p90/p95/p99/mean/min/max |

| Option | Type | Description |
|--------|------|-------------|
| `queries` | `string[]` | Test queries |
| `queryFn` | `(q: string) => Promise<unknown>` | Function to benchmark |
| `warmupQueries` | `number` | Queries to run before measurement |
| `iterations` | `number` | Measurement iterations |

#### Throughput

| Function | Description |
|----------|-------------|
| `benchmarkThroughput(options)` | Measure queries per second with concurrency |

| Option | Type | Description |
|--------|------|-------------|
| `queries` | `string[]` | Test queries |
| `queryFn` | `(q: string) => Promise<unknown>` | Function to benchmark |
| `concurrentQueries` | `number` | Max concurrent queries |

#### Cost

| Function | Description |
|----------|-------------|
| `calculateEmbeddingCost(tokens, model)` | Cost of embedding generation |
| `calculateRerankerCost(documents, provider)` | Cost of reranking |
| `calculateVectorSearchCost(queries)` | Cost of vector search |
| `calculateQueryCost(breakdown)` | Total per-query cost |
| `CostTracker` | Class for tracking cumulative costs |

#### Reporter

| Function | Description |
|----------|-------------|
| `generateMarkdownReport(result)` | Render benchmark as Markdown |
| `saveBenchmarkReport(result, path)` | Save report to file |
| `getEnvironmentInfo()` | Capture Node version, platform, CPU, memory |
| `createBenchmarkReport(latency, throughput, cost)` | Combine all results into a report |

### Dataset Management

#### Loader

| Function | Description |
|----------|-------------|
| `loadEvaluationDataset(path)` | Load a `.jsonl` dataset file |
| `loadEvaluationConfig(path)` | Load a YAML evaluation config |
| `validateEvaluationSample(sample)` | Zod-validate a sample |
| `splitDataset(dataset, ratio?)` | Split into train/test (default 80/20) |

#### Generator

| Function | Description |
|----------|-------------|
| `generateDataset(config)` | Generate synthetic evaluation samples |
| `generateAndSaveDataset(config, path)` | Generate and save to file |

## Dataset Format (.jsonl)

```jsonl
{"query_id": "q1", "query": "How do I reset my password?", "relevant_docs": ["doc-001"], "relevant_chunks": ["chunk-001-3"]}
{"query_id": "q2", "query": "What is the refund policy?", "relevant_docs": ["doc-010"], "relevant_chunks": ["chunk-010-2", "chunk-010-4"]}
```

## Related Packages

- [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) — Core types
- [@reaatech/hybrid-rag-pipeline](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline) — RAGPipeline (used for evaluation queries)
- [@reaatech/hybrid-rag-cli](https://www.npmjs.com/package/@reaatech/hybrid-rag-cli) — CLI with evaluate/ablate/benchmark commands

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

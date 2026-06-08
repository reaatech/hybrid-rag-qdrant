# RAG Evaluation

## Capability
Comprehensive evaluation framework for RAG retrieval quality.

## Evaluation Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `standard` | Evaluate retrieval quality on a single backend | Production monitoring |
| `ablation` | Measure contribution of each pipeline component | Architecture decisions |
| `db_benchmark` | Compare multiple vector DB backends | Backend selection, migration planning |

## Database Benchmarking (v2.0.0)

The `db_benchmark` mode compares retrieval quality, latency, and cost across backends:

```typescript
import { benchmarkVectorStores } from '@reaatech/hybrid-rag-evaluation';

const benchResults = await benchmarkVectorStores({
  dataset: evalDataset,
  backends: ['qdrant', 'pinecone', 'weaviate', 'chroma', 'pgvector'],
  metrics: ['recall@10', 'ndcg@10', 'latency_p50', 'latency_p99', 'cost_per_query'],
  queriesPerBackend: 100,
  warmupQueries: 10,
});

console.log(benchResults.summary);
// Backend      Recall@10   NDCG@10   P50(ms)   P99(ms)   Cost/query
// qdrant       0.82        0.78      45        120        $0.0012
// pinecone     0.81        0.77      35        95         $0.0018
// weaviate     0.80        0.76      50        140        $0.0015
// chroma       0.79        0.75      60        200        $0.0000
// pgvector     0.80        0.76      70        180        $0.0000
```

### Cross-DB Metrics

| Metric | Description |
|--------|-------------|
| `recall@K` | Fraction of relevant docs retrieved (quality) |
| `ndcg@K` | Rank-weighted relevance (quality) |
| `latency_p50` | Median query latency (performance) |
| `latency_p99` | Tail latency at 99th percentile (performance) |
| `cost_per_query` | Total cost including embeddings + DB + reranking (cost) |
| `throughput` | Queries per second under load (scalability) |

## Retrieval Metrics

| Metric | Description | Range |
|--------|-------------|-------|
| Precision@K | Fraction of retrieved docs that are relevant | [0, 1] |
| Recall@K | Fraction of relevant docs that are retrieved | [0, 1] |
| MAP | Mean Average Precision across queries | [0, 1] |
| MRR | Mean Reciprocal Rank of first relevant doc | [0, 1] |
| NDCG@K | Normalized Discounted Cumulative Gain | [0, 1] |

## Usage

```typescript
import { EvaluationRunner } from '@reaatech/hybrid-rag-evaluation';

const runner = new EvaluationRunner({
  ragPipeline: pipeline,
  metrics: ['precision@10', 'recall@10', 'ndcg@10', 'map', 'mrr'],
});

const results = await runner.evaluate(dataset);
console.log(results.summary);
// { precision@10: 0.75, recall@10: 0.82, ndcg@10: 0.78, map: 0.71, mrr: 0.85 }
```

## Dataset Format

```jsonl
{"query_id": "q1", "query": "How do I reset my password?", "relevant_docs": ["doc-001", "doc-005"], "relevant_chunks": ["chunk-001-3", "chunk-005-1"]}
{"query_id": "q2", "query": "What is the refund policy?", "relevant_docs": ["doc-010"], "relevant_chunks": ["chunk-010-2", "chunk-010-5"]}
```

## Per-Query Results

```typescript
console.log(results.perQuery);
// [
//   { query_id: 'q1', precision@10: 0.8, recall@10: 1.0, ndcg@10: 0.92, ... },
//   { query_id: 'q2', precision@10: 0.6, recall@10: 0.5, ndcg@10: 0.55, ... }
// ]
```

## Statistical Significance

```typescript
const comparison = await runner.compare(configA, configB, dataset);
console.log(comparison.pValue); // Statistical significance
console.log(comparison.effectSize); // Cohen's d
```

## Export Results

```typescript
await runner.export(results, {
  format: 'json', // or 'csv', 'markdown'
  outputPath: './eval-results.json',
});
```

## Generation Metrics (Optional)

If you have an LLM generating answers from retrieved context:

- **Faithfulness** — Does the answer follow from the context?
- **Answer Relevance** — Does the answer address the query?
- **Context Precision** — Are relevant chunks ranked higher?

These require LLM-as-judge and are tracked separately for cost reasons.

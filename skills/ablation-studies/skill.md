# Ablation Studies

## Capability
Measure the contribution of each RAG component to overall quality.

## What is Ablation?

Ablation studies systematically remove or modify components to measure their individual contribution:

| Configuration | NDCG@10 | Δ vs Baseline |
|---------------|---------|---------------|
| **Baseline (full pipeline)** | 0.78 | — |
| Without reranker | 0.68 | -0.10 (-13%) |
| Vector only | 0.65 | -0.13 (-17%) |
| BM25 only | 0.58 | -0.20 (-26%) |
| Semantic chunking | 0.75 | -0.03 (-4%) |
| Large chunks (1024) | 0.72 | -0.06 (-8%) |

## Configuration

```yaml
# ablation.yaml
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
    description: "Remove reranking step"
    changes:
      reranker: null

  - name: vector-only
    description: "Vector retrieval only"
    changes:
      retrieval: vector
      bm25_weight: 0

  - name: bm25-only
    description: "BM25 retrieval only"
    changes:
      retrieval: bm25
      vector_weight: 0

  - name: semantic-chunking
    description: "Use semantic chunking"
    changes:
      chunking: semantic
```

## Usage

```typescript
import { AblationRunner } from 'hybrid-rag-qdrant';

const runner = new AblationRunner({
  configPath: './ablation.yaml',
  basePipeline: pipeline,
});

const results = await runner.run(dataset);
console.log(results.summary);
```

## Output

```markdown
## Ablation Study Results

| Configuration | NDCG@10 | Precision@10 | Recall@10 | Cost/Query |
|---------------|---------|--------------|-----------|------------|
| Baseline | 0.78 | 0.75 | 0.82 | $0.013 |
| No reranker | 0.68 | 0.65 | 0.74 | $0.003 |
| Vector only | 0.65 | 0.62 | 0.70 | $0.003 |
| BM25 only | 0.58 | 0.55 | 0.63 | $0.000 |

## Component Contributions

- Reranker: +0.10 NDCG (+15%), +$0.01/query
- Hybrid (vs vector-only): +0.13 NDCG (+20%), +$0.00/query
- Hybrid (vs BM25-only): +0.20 NDCG (+34%), +$0.003/query
```

## Statistical Significance

```typescript
console.log(results.significance);
// {
//   no-reranker: { pValue: 0.003, significant: true },
//   vector-only: { pValue: 0.012, significant: true },
//   bm25-only: { pValue: 0.001, significant: true },
// }
```

## CLI Usage

```bash
npx hybrid-rag-qdrant ablate \
  --config ablation.yaml \
  --dataset eval-queries.jsonl \
  --output ablation-results.json \
  --format markdown

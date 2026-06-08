# Hybrid Fusion

## Capability
Combine vector and BM25 retrieval results using various fusion strategies.

## Fusion Strategies

| Strategy | Formula | Best When |
|----------|---------|-----------|
| RRF | Σ 1/(k + rank_i) | Scores on different scales |
| Weighted Sum | w1*score1 + w2*score2 | Scores on similar scales |
| Normalized | w1*norm(s1) + w2*norm(s2) | Different distributions |

## Hybrid-Native Delegation (v2.0.0)

When the underlying vector store advertises `supportsHybridSearch: true`, the fusion layer delegates to the adapter's native hybrid search — avoiding client-side fusion entirely. When false, client-side BM25 + vector fusion is used.

### Native hybrid support by backend:

| Backend | Native Support | Mechanism |
|----------|---------------|-----------|
| Weaviate | Yes | Alpha-weighted hybrid (`alpha` controls vector vs keyword balance) |
| Pinecone | Yes | Sparse-dense hybrid embeddings (learned sparse vectors + dense vectors) |
| Elasticsearch | Yes | `bm25` + `knn` combined query |
| OpenSearch | Yes | Neural search + BM25 hybrid |
| Vespa | Yes | WAND + nearest neighbor |
| Qdrant | No (client-side) | Fusion layer performs RRF/weighted on client |
| Chroma | No (client-side) | Fusion layer performs RRF/weighted on client |
| PgVector | No (client-side) | Fusion layer performs RRF/weighted on client |

### Delegation logic:

```typescript
const capabilities = vectorStore.getCapabilities();

if (capabilities.supportsHybridSearch) {
  // Adapter handles fusion natively — no client-side work
  return await vectorStore.hybridSearch({ vector, text: query, topK, filter });
}

// Client-side: run both retrievals and fuse
const [vectorResults, bm25Results] = await Promise.all([
  vectorStore.search({ vector, topK: topK * 2, filter }),
  bm25Index.search(query, topK * 2),
]);
return fusionEngine.fuse({ vectorResults, bm25Results, topK });
```

**Weaviate example** (alpha-weighted native hybrid):
```typescript
// Weaviate adapter handles this internally via GraphQL:
// { Get { Document { ... } } } with hybrid: { query, alpha: 0.75 }
// where alpha 0 = pure keyword, alpha 1 = pure vector
```

**Pinecone example** (sparse-dense native hybrid):
```typescript
// Pinecone adapter uses the pinecone-client sparseValues + dense vector
// search via index.search({ vector: { values: dense, sparseValues: sparse }, ... })
```

## Usage

```typescript
import { HybridFusion, FusionStrategy } from '@reaatech/hybrid-rag-retrieval';

const fusion = new HybridFusion({
  strategy: FusionStrategy.RRF,
  k: 60, // for RRF
  weights: { vector: 0.7, bm25: 0.3 }, // for weighted sum
});

const fusedResults = await fusion.fuse({
  vectorResults: vectorCandidates,
  bm25Results: bm25Candidates,
  topK: 10,
});
```

## Reciprocal Rank Fusion (RRF)

Default strategy, parameter-free:

```
RRF_score = Σ 1 / (k + rank_i)
```

where k=60 by default and rank_i is the position in each result list.

## Weighted Sum

```typescript
const fusion = new HybridFusion({
  strategy: FusionStrategy.WEIGHTED_SUM,
  weights: {
    vector: 0.7,
    bm25: 0.3,
  },
});
```

## Score Normalization

```typescript
const fusion = new HybridFusion({
  strategy: FusionStrategy.NORMALIZED_SUM,
  normalization: 'minmax', // or 'zscore', 'rank'
  weights: { vector: 0.6, bm25: 0.4 },
});
```

## With Reranking

```typescript
const fused = await fusion.fuse({ vectorResults, bm25Results, topK: 20 });
const reranked = await reranker.rerank({ query, documents: fused, topK: 10 });
```

## Performance

| Strategy | Tuning Required | Robustness |
|----------|-----------------|------------|
| RRF | None | High |
| Weighted Sum | Weights | Medium |
| Normalized | Weights + method | Medium |

RRF is recommended as the default because it requires no tuning and works well across different retrieval systems.

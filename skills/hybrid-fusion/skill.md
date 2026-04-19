# Hybrid Fusion

## Capability
Combine vector and BM25 retrieval results using various fusion strategies.

## Fusion Strategies

| Strategy | Formula | Best When |
|----------|---------|-----------|
| RRF | Σ 1/(k + rank_i) | Scores on different scales |
| Weighted Sum | w1*score1 + w2*score2 | Scores on similar scales |
| Normalized | w1*norm(s1) + w2*norm(s2) | Different distributions |

## Usage

```typescript
import { HybridFusion, FusionStrategy } from 'hybrid-rag-qdrant';

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

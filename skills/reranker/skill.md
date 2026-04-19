# Reranker

## Capability
Cross-encoder reranking to improve retrieval quality.

## Providers

| Provider | Model | Cost/Request | Avg Latency |
|----------|-------|--------------|-------------|
| Cohere | rerank-english-v3.0 | $0.001 | ~500ms |
| Jina | jina-reranker-v1 | $0.0005 | ~400ms |
| OpenAI | gpt-4-turbo | ~$0.01 | ~2000ms |
| Local | cross-encoder/ms-marco | $0 | ~100ms |

## Usage

```typescript
import { Reranker, RerankerProvider } from 'hybrid-rag-qdrant';

const reranker = new Reranker({
  provider: RerankerProvider.COHERE,
  model: 'rerank-english-v3.0',
  apiKey: process.env.COHERE_API_KEY,
});

const reranked = await reranker.rerank({
  query: 'how to reset password',
  documents: candidates, // from fusion step
  topK: 5,
});
```

## Batch Processing

```typescript
const results = await reranker.rerankBatch({
  query: 'refund policy',
  documents: allCandidates,
  batchSize: 20,
  maxCost: 1.00, // stop if cost exceeds $1
});
```

## Cost Tracking

```typescript
const cost = reranker.calculateCost({
  documentCount: 10,
  queryLength: 50,
});
```

## Local Reranker

For zero-cost reranking:

```typescript
const reranker = new Reranker({
  provider: RerankerProvider.LOCAL,
  model: 'cross-encoder/ms-marco-MiniLM-L6-v2',
  device: 'cpu', // or 'cuda'
});
```

## When to Use

Reranking typically improves NDCG@10 by 10-15% but adds:
- Latency: 400-2000ms depending on provider
- Cost: $0.0005-$0.01 per query
- API calls: Additional external dependency

Use the ablation framework to measure the tradeoff for your specific use case.

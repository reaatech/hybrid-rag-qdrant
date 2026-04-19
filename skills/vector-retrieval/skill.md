# Vector Retrieval

## Capability
Semantic search using Qdrant vector database with provider-agnostic embeddings.

## Embedding Providers

| Provider | Model | Dimensions | Cost/1M tokens |
|----------|-------|------------|----------------|
| OpenAI | text-embedding-3-small | 1536 | $0.02 |
| OpenAI | text-embedding-3-large | 3072 | $0.13 |
| Vertex AI | text-embedding-004 | 768 | $0.025 |
| Local | all-MiniLM-L6-v2 | 384 | $0 |

## Usage

```typescript
import { VectorRetriever, EmbeddingProvider } from 'hybrid-rdrant';

const retriever = new VectorRetriever({
  qdrantUrl: process.env.QDRANT_URL,
  embeddingProvider: EmbeddingProvider.OPENAI,
  model: 'text-embedding-3-small',
  collectionName: 'documents',
});

// Index chunks
await retriever.upsert(chunks);

// Search
const results = await retriever.search(query, {
  topK: 10,
  filter: { department: 'engineering' },
});
```

## Similarity Metrics

- **Cosine** (default) — best for normalized embeddings
- **Euclidean** — for absolute distance
- **Dot Product** — for unnormalized scores

## Metadata Filtering

```typescript
const results = await retriever.search(query, {
  filter: {
    must: [
      { key: 'department', match: { value: 'engineering' } },
      { key: 'date', range: { gte: '2026-01-01' } },
    ],
  },
});
```

## Batch Embedding

```typescript
const embeddings = await retriever.generateEmbeddings(texts, {
  batchSize: 100,
  maxRetries: 3,
  rateLimitPerSecond: 10,
});
```

## Cost Tracking

```typescript
const cost = retriever.calculateCost({
  inputTokens: 10000,
  outputTokens: 0,
});
// Returns cost in USD based on provider pricing

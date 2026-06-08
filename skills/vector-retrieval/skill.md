# Vector Retrieval

## Capability
Multi-provider semantic search via any supported vector database backend (15 backends in v2.0.0). Uses the `VectorStoreFactory` and `createVectorStore()` pattern to swap databases without changing retrieval logic.

## Multi-Provider Architecture

`VectorSearchEngine` uses dependency injection to accept any `VectorStoreAdapter`:

```typescript
import { VectorSearchEngine, createVectorStore } from '@reaatech/hybrid-rag-retrieval';

const vectorStore = await createVectorStore({
  provider: 'qdrant',       // or 'pinecone', 'weaviate', 'chroma', 'pgvector', etc.
  url: process.env.VECTOR_STORE_URL,
  apiKey: process.env.VECTOR_STORE_API_KEY,
  collectionName: 'documents',
});

const searchEngine = new VectorSearchEngine(vectorStore);
await searchEngine.initialize();
```

### `VectorStoreFactory` Pattern

```typescript
import { VectorStoreFactory } from '@reaatech/hybrid-rag-retrieval';

const factory = new VectorStoreFactory();
factory.register('qdrant', QdrantAdapter);
factory.register('pinecone', PineconeAdapter);
// ... 15 backends registered

const store = factory.create('pinecone', {
  apiKey: process.env.PINECONE_API_KEY,
  environment: 'us-east-1-aws',
  collectionName: 'documents',
});
```

## Embedding Providers

| Provider | Model | Dimensions | Cost/1M tokens |
|----------|-------|------------|----------------|
| OpenAI | text-embedding-3-small | 1536 | $0.02 |
| OpenAI | text-embedding-3-large | 3072 | $0.13 |
| Vertex AI | text-embedding-004 | 768 | $0.025 |
| Local | all-MiniLM-L6-v2 | 384 | $0 |

## Usage

```typescript
import { VectorSearchEngine } from '@reaatech/hybrid-rag-retrieval';
import { EmbeddingService } from '@reaatech/hybrid-rag-embedding';

const vectorStore = await createVectorStore({
  provider: 'qdrant',
  vectorStore: {
    url: process.env.VECTOR_STORE_URL,
    apiKey: process.env.VECTOR_STORE_API_KEY,
  },
  embeddingProvider: EmbeddingProvider.OPENAI,
  model: 'text-embedding-3-small',
  collectionName: 'documents',
});

const searchEngine = new VectorSearchEngine(vectorStore);
await searchEngine.initialize();

// Index chunks
await searchEngine.upsert(chunks);

// Search
const results = await searchEngine.search(query, {
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

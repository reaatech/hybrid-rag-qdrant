# @reaatech/hybrid-rag-qdrant

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-qdrant.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-qdrant)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Qdrant vector database adapter for hybrid RAG systems. Provides a clean wrapper around `@qdrant/js-client-rest` with collection management, batch upsert, vector search with metadata filtering, and health checks.

## Installation

```bash
npm install @reaatech/hybrid-rag-qdrant
# or
pnpm add @reaatech/hybrid-rag-qdrant
```

## Feature Overview

- **Collection management** — auto-create collections with configurable vector size and distance metric
- **Batch upsert** — chunked ingestion with configurable batch sizes (default 100)
- **Vector search** — cosine/euclidean/dot similarity with metadata filtering
- **Metadata filter builder** — automatic conversion from `Record<string, unknown>` to Qdrant filter conditions
- **Health check** — connectivity verification for container orchestration
- **Type-safe** — full TypeScript support with types from `@reaatech/hybrid-rag`

## Quick Start

```typescript
import { QdrantClientWrapper } from '@reaatech/hybrid-rag-qdrant';

const client = new QdrantClientWrapper({
  url: 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
  collectionName: 'documents',
  vectorSize: 1536,
  distance: 'Cosine',
});

await client.initialize();

// Upsert a point
await client.upsertPoint({
  id: 'chunk-001-0',
  vector: [0.1, 0.2, /* ... */],
  payload: {
    documentId: 'doc-001',
    content: 'The quick brown fox jumps over the lazy dog.',
    index: 0,
    metadata: { source: 'wiki' },
  },
});

// Search
const results = await client.search({
  vector: queryEmbedding,
  topK: 10,
  filter: { department: 'engineering' },
});

console.log(results[0].content, results[0].score);
```

## API Reference

### `QdrantClientWrapper`

#### Constructor

```typescript
new QdrantClientWrapper(config: QdrantClientConfig)
```

#### `QdrantClientConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `url` | `string` | (required) | Qdrant server URL |
| `apiKey` | `string` | — | API key for authentication |
| `collectionName` | `string` | (required) | Default collection name |
| `vectorSize` | `number` | (required) | Vector dimension (e.g. 1536 for text-embedding-3-small) |
| `distance` | `'Cosine' \| 'Euclid' \| 'Dot'` | `'Cosine'` | Similarity metric |

#### Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Ensure collection exists (creates if not) |
| `collectionExists(name)` | Check if a named collection exists |
| `createCollection(name, params)` | Create a new collection with vector params |
| `upsertPoint(point)` | Upsert a single point |
| `upsertBatch(points)` | Upsert points in batches of 100 |
| `search(query)` | Vector search returning `RetrievalResult[]` |
| `deleteCollection(name)` | Delete a collection |
| `getCollectionInfo(name)` | Get collection metadata |
| `healthCheck()` | Verify Qdrant connectivity — returns `boolean` |

### `QdrantPoint`

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Point identifier (typically the chunk ID) |
| `vector` | `number[]` | Embedding vector |
| `payload` | `Record<string, unknown>` | Arbitrary metadata stored with the point |

### Filter Building

Metadata filters are automatically converted to Qdrant `must` conditions:

```typescript
{ department: 'engineering', status: 'published' }
// Becomes → { must: [{ key: 'department', match: { value: 'engineering' } }, ...] }
```

## Choosing a Distance Metric

| Metric | Best For | Description |
|--------|----------|-------------|
| `Cosine` | Text embeddings | Measures angle between vectors (default, recommended for most LLM embeddings) |
| `Euclid` | Dense vectors | Straight-line distance in vector space |
| `Dot` | Normalized vectors | Equivalent to cosine similarity when vectors are normalized |

## Related Packages

- [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) — Core types (`VectorQuery`, `RetrievalResult`)
- [@reaatech/hybrid-rag-embedding](https://www.npmjs.com/package/@reaatech/hybrid-rag-embedding) — Embedding generation
- [@reaatech/hybrid-rag-retrieval](https://www.npmjs.com/package/@reaatech/hybrid-rag-retrieval) — Vector search engine (uses this package)

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

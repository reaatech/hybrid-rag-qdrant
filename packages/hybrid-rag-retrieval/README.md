# @reaatech/hybrid-rag-retrieval

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-retrieval.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-retrieval)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Hybrid retrieval engine combining vector search (via Qdrant), BM25 keyword search, cross-encoder reranking, and configurable score fusion strategies. The core retrieval stack for hybrid RAG systems.

## Installation

```bash
npm install @reaatech/hybrid-rag-retrieval
# or
pnpm add @reaatech/hybrid-rag-retrieval
```

## Feature Overview

- **Vector search** — semantic search via Qdrant with configurable distance metrics and metadata filtering
- **BM25 keyword search** — Okapi BM25 ranking with configurable k1/b parameters, stopword removal, stemming, n-gram tokenization
- **Three fusion strategies** — Reciprocal Rank Fusion (RRF), Weighted Sum, Normalized Score fusion
- **Score normalization** — Min-Max, Z-Score, and Rank normalization
- **Cross-encoder reranking** — Cohere, Jina, OpenAI, and local provider support
- **Hybrid retriever** — single interface orchestrating vector search, BM25 search, fusion, and optional reranking

## Quick Start

```typescript
import {
  HybridRetriever,
  VectorSearchEngine,
  BM25SearchEngine,
  RerankerEngine,
} from '@reaatech/hybrid-rag-retrieval';

const retriever = new HybridRetriever({
  vector: {
    qdrant: {
      url: process.env.QDRANT_URL,
      collectionName: 'documents',
    },
    embedding: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    },
    topK: 20,
  },
  bm25: {
    k1: 1.2,
    b: 0.75,
    topK: 20,
  },
  fusion: {
    strategy: 'rrf',
  },
  topK: 10,
});

await retriever.initialize();

// Ingest chunks
await retriever.indexChunks(chunks);

// Retrieve
const results = await retriever.retrieve('How do I configure SSO?', {
  topK: 10,
  retrievalMode: 'hybrid', // 'hybrid' | 'vector' | 'bm25'
});
```

## API Reference

### Vector Search

#### `VectorSearchEngine`

Orchestrates Qdrant + embedding into a single search interface.

```typescript
const engine = new VectorSearchEngine({
  qdrant: { url: '...', collectionName: 'docs' },
  embedding: { provider: 'openai', model: 'text-embedding-3-small' },
  topK: 10,
  distance: 'Cosine',
});

await engine.initialize();
await engine.indexChunks(chunks);
const results = await engine.search('query text', { topK: 10 });
```

| Method | Description |
|--------|-------------|
| `initialize()` | Connect to Qdrant and ensure collection exists |
| `indexChunks(chunks)` | Generate embeddings and upsert to Qdrant |
| `search(query, options?)` | Embed query and search Qdrant |
| `searchByVector(vector, options?)` | Search with a pre-computed embedding |
| `healthCheck()` | Verify Qdrant connectivity |

### BM25 Search

#### `BM25SearchEngine`

In-process BM25 search with configurable parameters.

```typescript
const engine = new BM25SearchEngine({
  k1: 1.2,
  b: 0.75,
  topK: 10,
});

await engine.indexChunks(chunks);
const results = engine.search('query text', { topK: 10 });
```

| Method | Description |
|--------|-------------|
| `indexChunks(chunks)` | Tokenize and index all chunks |
| `search(query, options?)` | Tokenize query and rank by BM25 score |

#### `BM25Engine`

Low-level BM25 implementation with tokenization control.

| Constructor Param | Type | Default | Description |
|-------------------|------|---------|-------------|
| `k1` | `number` | `1.2` | Term frequency saturation parameter |
| `b` | `number` | `0.75` | Length normalization parameter |

#### `Tokenizer`

Configurable text tokenizer supporting stopword removal, stemming, and n-grams.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `removeStopWords` | `boolean` | `true` | Filter common English stop words |
| `applyStemming` | `boolean` | `true` | Apply Porter stemmer |
| `minTokenLength` | `number` | `2` | Minimum token length |
| `ngramRange` | `[number, number]` | `[1, 1]` | N-gram range for tokenization |

### Reranking

#### `RerankerEngine`

Cross-encoder reranking supporting multiple providers.

```typescript
const reranker = new RerankerEngine({
  provider: 'cohere',
  model: 'rerank-english-v3.0',
  apiKey: process.env.COHERE_API_KEY,
});

const reranked = await reranker.rerankResults('query text', retrievalResults);
```

#### `RerankerConfig`

| Property | Type | Description |
|----------|------|-------------|
| `provider` | `'cohere' \| 'jina' \| 'openai' \| 'local'` | Reranker provider |
| `model` | `string` | Provider-specific model name |
| `apiKey` | `string` | API key for cloud providers |

| Method | Description |
|--------|-------------|
| `rerankResults(query, results)` | Rerank retrieval results using cross-encoder scoring |

### Fusion Strategies

#### Strategy Types

| Strategy | Type | Formula | When to Use |
|----------|------|---------|-------------|
| RRF | `'rrf'` | `Σ 1/(k + rank_i)` | No tuning required, robust |
| Weighted Sum | `'weighted-sum'` | `w1*score + w2*score` | When scores are on similar scales |
| Normalized | `'normalized'` | `w1*norm(score) + w2*norm(score)` | Different score distributions |

#### `FusionConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `strategy` | `FusionStrategyType` | `'rrf'` | Fusion algorithm |
| `vectorWeight` | `number` | `0.7` | Weight for vector scores in weighted/normalized mode |
| `bm25Weight` | `number` | `0.3` | Weight for BM25 scores in weighted/normalized mode |
| `k` | `number` | `60` | RRF constant |

#### Functions

| Function | Description |
|----------|-------------|
| `applyFusion(vectorResults, bm25Results, config)` | Fuse two result sets |
| `reciprocalRankFusion(v, b, k?)` | RRF-specific helper |
| `weightedSumFusion(v, b, w1, w2)` | Weighted sum helper |
| `normalizedFusion(v, b, w1, w2)` | Normalized fusion helper |

#### Normalization

| Function | Description |
|----------|-------------|
| `minMaxNormalize(results)` | Scale scores to [0, 1] range |
| `zScoreNormalize(results)` | Center around 0 with unit variance |
| `rankNormalize(results)` | Convert to rank-based scores |
| `normalize(results, method)` | Apply the specified normalization |

### Hybrid Retriever

#### `HybridRetriever`

The high-level orchestrator. Coordinates vector search, BM25 search, fusion, and optional reranking.

```typescript
const retriever = new HybridRetriever(config);
await retriever.initialize();
await retriever.indexChunks(chunks);

const results = await retriever.retrieve('query', {
  topK: 10,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  filter: { department: 'engineering' },
  retrievalMode: 'hybrid',
});
```

#### `HybridRetrievalOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `topK` | `number` | `10` | Number of results to return |
| `vectorWeight` | `number` | `0.7` | Vector weight in fusion |
| `bm25Weight` | `number` | `0.3` | BM25 weight in fusion |
| `filter` | `Record<string, unknown>` | — | Metadata filter for vector search |
| `retrievalMode` | `'hybrid' \| 'vector' \| 'bm25'` | `'hybrid'` | Search mode |

## Related Packages

- [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) — Core types
- [@reaatech/hybrid-rag-qdrant](https://www.npmjs.com/package/@reaatech/hybrid-rag-qdrant) — Qdrant adapter
- [@reaatech/hybrid-rag-embedding](https://www.npmjs.com/package/@reaatech/hybrid-rag-embedding) — Embedding generation
- [@reaatech/hybrid-rag-ingestion](https://www.npmjs.com/package/@reaatech/hybrid-rag-ingestion) — Document loading + chunking
- [@reaatech/hybrid-rag-pipeline](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline) — RAGPipeline orchestrator

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

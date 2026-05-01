# @reaatech/hybrid-rag-pipeline

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-pipeline.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Main RAGPipeline orchestrator — provides a unified interface for document ingestion and hybrid retrieval with optional reranking. This is the primary entry point for most users of the hybrid RAG ecosystem.

## Installation

```bash
npm install @reaatech/hybrid-rag-pipeline
# or
pnpm add @reaatech/hybrid-rag-pipeline
```

## Feature Overview

- **Single-class API** — one `RAGPipeline` class handles ingestion and retrieval
- **Lazy initialization** — automatic connection setup on first use, deduplicated concurrent init calls
- **Hybrid retrieval** — vector + BM25 search with configurable fusion weights
- **Optional reranking** — plug in Cohere, Jina, OpenAI, or local cross-encoder reranker
- **Configurable chunking** — choose strategy and parameters at pipeline level
- **Pipeline stats** — get collection stats, document counts, chunk counts

## Quick Start

```typescript
import { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';
import { ChunkingStrategy } from '@reaatech/hybrid-rag';

const pipeline = new RAGPipeline({
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  collectionName: 'knowledge-base',

  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingApiKey: process.env.OPENAI_API_KEY,

  chunkingStrategy: ChunkingStrategy.FIXED_SIZE,
  chunkSize: 512,
  chunkOverlap: 50,

  useHybrid: true,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  fusionStrategy: 'rrf',

  rerankerProvider: 'cohere',
  rerankerApiKey: process.env.COHERE_API_KEY,
  rerankTopK: 20,
  rerankFinalK: 10,

  topK: 10,
});

await pipeline.initialize();

// Ingest
const chunks = await pipeline.ingest([
  { id: 'doc-1', content: 'Password reset requires email verification...' },
  { id: 'doc-2', content: 'Refund policy: requests must be submitted within 14 days...' },
]);

// Query
const results = await pipeline.query('How do I reset my password?', {
  topK: 5,
  useReranker: true,
  filter: { department: 'engineering' },
});

for (const r of results) {
  console.log(`[${r.score.toFixed(3)}] ${r.content.substring(0, 80)}...`);
}

// Stats
const stats = await pipeline.getStats();
console.log(`Collection: ${stats.collectionName}, Docs: ${stats.totalDocuments}, Chunks: ${stats.totalChunks}`);

// Cleanup
await pipeline.close();
```

## API Reference

### `RAGPipeline`

#### Constructor

```typescript
new RAGPipeline(config: RAGPipelineConfig)
```

#### `RAGPipelineConfig`

| Category | Property | Type | Default | Description |
|----------|----------|------|---------|-------------|
| **Qdrant** | `qdrantUrl` | `string` | (required) | Qdrant server URL |
| | `qdrantApiKey` | `string` | — | Qdrant API key |
| | `collectionName` | `string` | `'documents'` | Qdrant collection name |
| **Embedding** | `embeddingProvider` | `'openai' \| 'vertex' \| 'local'` | `'openai'` | Embedding provider |
| | `embeddingModel` | `string` | `'text-embedding-3-small'` | Model name |
| | `embeddingApiKey` | `string` | — | API key |
| **Chunking** | `chunkingStrategy` | `ChunkingStrategy` | `FIXED_SIZE` | Chunking strategy |
| | `chunkSize` | `number` | `512` | Chunk size in tokens |
| | `chunkOverlap` | `number` | `50` | Overlap in tokens |
| **Retrieval** | `topK` | `number` | `10` | Default result count |
| | `useHybrid` | `boolean` | `true` | Enable hybrid (vector + BM25) |
| | `vectorWeight` | `number` | `0.7` | Vector score weight |
| | `bm25Weight` | `number` | `0.3` | BM25 score weight |
| **BM25** | `bm25K1` | `number` | `1.2` | BM25 term frequency saturation |
| | `bm25B` | `number` | `0.75` | BM25 length normalization |
| **Fusion** | `fusionStrategy` | `'rrf' \| 'weighted-sum' \| 'normalized'` | `'rrf'` | Fusion algorithm |
| **Reranker** | `rerankerProvider` | `string \| null` | `null` | Reranker provider (null = disabled) |
| | `rerankerModel` | `string` | — | Reranker model name |
| | `rerankerApiKey` | `string` | — | Reranker API key |
| | `rerankTopK` | `number` | `20` | Candidates to rerank |
| | `rerankFinalK` | `number` | `10` | Results after reranking |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `initialize()` | `Promise<void>` | Set up connections, lazy and deduplicated |
| `ingest(documents)` | `Promise<Chunk[]>` | Chunk and index documents |
| `query(text, options?)` | `Promise<RetrievalResult[]>` | Hybrid retrieval with optional reranking |
| `getStats()` | `Promise<PipelineStats>` | Collection stats and doc/chunk counts |
| `close()` | `Promise<void>` | Release connections and reset |

#### `QueryOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `topK` | `number` | pipeline default | Result count |
| `useReranker` | `boolean` | `true` if reranker configured | Enable reranking |
| `rerankTopK` | `number` | `20` | Candidates to rerank |
| `rerankFinalK` | `number` | `10` | Final result count after reranking |
| `vectorWeight` | `number` | `0.7` | Vector weight override |
| `bm25Weight` | `number` | `0.3` | BM25 weight override |
| `filter` | `Record<string, unknown>` | — | Metadata filter |
| `retrievalMode` | `'hybrid' \| 'vector' \| 'bm25'` | `'hybrid'` | Search mode |

## Usage Patterns

### Vector-Only Mode

```typescript
const results = await pipeline.query('query', {
  retrievalMode: 'vector',
  topK: 10,
});
```

### Cost-Conscious Mode (No Reranker)

```typescript
const pipeline = new RAGPipeline({
  qdrantUrl: process.env.QDRANT_URL,
  rerankerProvider: null, // skip reranker entirely
});

const results = await pipeline.query('query', { topK: 10 });
```

### Multi-Filter Search

```typescript
const results = await pipeline.query('API rate limits', {
  filter: {
    department: 'engineering',
    status: 'published',
    version: 'v2',
  },
});
```

## Related Packages

- [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) — Core types
- [@reaatech/hybrid-rag-ingestion](https://www.npmjs.com/package/@reaatech/hybrid-rag-ingestion) — Document loading + chunking
- [@reaatech/hybrid-rag-retrieval](https://www.npmjs.com/package/@reaatech/hybrid-rag-retrieval) — Retrieval engines
- [@reaatech/hybrid-rag-evaluation](https://www.npmjs.com/package/@reaatech/hybrid-rag-evaluation) — Evaluation + benchmarking
- [@reaatech/hybrid-rag-cli](https://www.npmjs.com/package/@reaatech/hybrid-rag-cli) — CLI interface

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

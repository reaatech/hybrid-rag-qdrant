# @reaatech/hybrid-rag-embedding

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-embedding.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-embedding)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Provider-agnostic embedding generation for hybrid RAG systems. Currently supports OpenAI embeddings with extension points for Vertex AI and local models.

## Installation

```bash
npm install @reaatech/hybrid-rag-embedding
# or
pnpm add @reaatech/hybrid-rag-embedding
```

## Feature Overview

- **Provider abstraction** — single interface across OpenAI, Vertex AI, and local models
- **Batch processing** — configurable batch size with automatic rate limiting
- **Cost tracking** — per-request cost calculation based on model pricing
- **Dimension lookup** — static method to get the embedding dimension for known models
- **OpenAI integration** — full `text-embedding-3-small` and `text-embedding-3-large` support

## Quick Start

```typescript
import { EmbeddingService } from '@reaatech/hybrid-rag-embedding';

const embedder = new EmbeddingService({
  provider: 'openai',
  model: 'text-embedding-3-small',
  apiKey: process.env.OPENAI_API_KEY,
  batchSize: 100,
  rateLimit: 3500, // requests per minute
});

// Single text
const { embedding, tokens, cost } = await embedder.embed('Hello world');
console.log(`Vector dimension: ${embedding.length}, Cost: $${cost}`);

// Batch
const texts = ['Document one...', 'Document two...', 'Document three...'];
const results = await embedder.embedBatch(texts);
const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
```

## API Reference

### `EmbeddingService`

#### Constructor

```typescript
new EmbeddingService(config: EmbeddingConfig)
```

#### `EmbeddingConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `provider` | `'openai' \| 'vertex' \| 'local'` | (required) | Embedding provider |
| `model` | `string` | (required) | Model name (e.g. `text-embedding-3-small`) |
| `apiKey` | `string` | — | API key for cloud providers |
| `dimension` | `number` | — | Embedding dimension (auto-detected for known models) |
| `batchSize` | `number` | `100` | Max texts per batch request |
| `rateLimit` | `number` | — | Requests per minute throttle |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `embed(text)` | `Promise<EmbeddingResult>` | Generate embedding for a single text |
| `embedBatch(texts)` | `Promise<EmbeddingResult[]>` | Generate embeddings for multiple texts with batching and rate limiting |

#### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getDimension(model)` | `number` | Get the dimension for a known model (1536 for `text-embedding-3-small`, 3072 for `text-embedding-3-large`) |

### `EmbeddingResult`

| Property | Type | Description |
|----------|------|-------------|
| `embedding` | `number[]` | The embedding vector |
| `tokens` | `number` | Number of tokens consumed |
| `cost` | `number` | Cost in USD |

### Cost Calculation

Pricing is built-in for known models:

| Model | Cost per 1M tokens |
|-------|-------------------|
| `text-embedding-3-small` | $0.02 |
| `text-embedding-3-large` | $0.13 |

## Provider Extensibility

The `Vertex AI` and `local` providers are extension points. To add a new provider:

```typescript
class CustomEmbedder extends EmbeddingService {
  private async embedCustom(text: string): Promise<EmbeddingResult> {
    // Your implementation here
    return { embedding: [/* ... */], tokens: 0, cost: 0 };
  }
}
```

## Related Packages

- [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) — Core types
- [@reaatech/hybrid-rag-qdrant](https://www.npmjs.com/package/@reaatech/hybrid-rag-qdrant) — Qdrant vector DB (consumes embeddings)

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

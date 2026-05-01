# @reaatech/hybrid-rag

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Core domain types, Zod schemas, and shared type utilities for the hybrid RAG ecosystem. This package is the single source of truth for all document, chunking, retrieval, evaluation, ablation, and benchmarking types used throughout the `@reaatech/hybrid-rag-*` family.

## Installation

```bash
npm install @reaatech/hybrid-rag
# or
pnpm add @reaatech/hybrid-rag
```

## Feature Overview

- **Domain types** — `Document`, `Chunk`, `RetrievalResult`, `HybridResult`, `RerankedResult`, and more
- **Enum types** — `ChunkingStrategy` with four strategies (`fixed-size`, `semantic`, `recursive`, `sliding-window`)
- **Zod schemas** — runtime validation for documents, chunks, chunking configs, evaluation samples, ablation configs, vector queries, and BM25 queries
- **Evaluation types** — `EvaluationSample`, `EvaluationResult`, summary metrics with standard deviations
- **Ablation types** — `AblationConfig`, `AblationResult` with delta comparisons
- **Benchmarking types** — `BenchmarkResult` with latency percentiles, component breakdowns, cost tracking, throughput, and environment info
- **Zero runtime dependencies** beyond `zod` — lightweight and tree-shakeable
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  ChunkingStrategy,
  type Document,
  type Chunk,
  type ChunkingConfig,
  type RetrievalResult,
  type EvaluationSample,
} from '@reaatech/hybrid-rag';

const doc: Document = {
  id: 'doc-001',
  content: 'Your document text here...',
  source: '/data/knowledge-base.md',
  metadata: { department: 'engineering' },
};

const config: ChunkingConfig = {
  strategy: ChunkingStrategy.SEMANTIC,
  chunkSize: 512,
  overlap: 50,
};
```

## Schema Validation

Every type has a matching Zod schema for runtime validation:

```typescript
import { DocumentSchema, ChunkingConfigSchema, validateDocument } from '@reaatech/hybrid-rag';

// Validate at the boundary — throws ZodError on invalid data
const validDoc = DocumentSchema.parse(rawJson);

// Or use the convenience validators
const validatedDoc = validateDocument(rawJson);
```

## Exports

### Document Types

| Export | Description |
|--------|-------------|
| `Document` | Source document with id, content, source, metadata, optional title/author/date |
| `DocumentSchema` / `DocumentInput` | Zod schema and inferred type for document validation |

### Chunking Types

| Export | Description |
|--------|-------------|
| `ChunkingStrategy` | Enum: `fixed-size`, `semantic`, `recursive`, `sliding-window` |
| `ChunkingConfig` | Strategy configuration: chunkSize, overlap, thresholds, separators |
| `ChunkingConfigSchema` | Zod schema with defaults (512 chunk size, 50 overlap) |
| `Chunk` | Text chunk: id, documentId, content, embedding, tokenCount, position, metadata |

### Retrieval Types

| Export | Description |
|--------|-------------|
| `VectorQuery` | Vector search input: vector, topK, distance metric, filter |
| `BM25Query` | BM25 search input: query text, topK, k1/b parameters, filter |
| `RetrievalResult` | Single result: chunkId, documentId, content, score, source |
| `HybridResult` | Post-fusion results with vectorScore, bm25Score, vectorRank, bm25Rank |
| `RerankedResult` | Post-reranker results with rerankerScore, fusedScore, finalScore |

### Evaluation Types

| Export | Description |
|--------|-------------|
| `EvaluationSample` | Ground truth: query_id, query, relevant_docs, relevant_chunks, ideal_answer |
| `EvaluationResult` | Per-query metrics + aggregate summary with standard deviations |
| `EvaluationSampleSchema` | Zod schema with required relevant_docs and relevant_chunks arrays |

### Ablation Types

| Export | Description |
|--------|-------------|
| `AblationConfig` | Baseline + variants with changes to chunking, retrieval, reranker, weights |
| `AblationResult` | Baseline metrics + per-variant results with delta comparisons |
| `AblationConfigSchema` | Zod schema with nullable reranker field |

### Benchmarking Types

| Export | Description |
|--------|-------------|
| `BenchmarkResult` | Latency percentiles (p50/p90/p95/p99), component breakdown, cost, throughput |

## Related Packages

- [@reaatech/hybrid-rag-observability](https://www.npmjs.com/package/@reaatech/hybrid-rag-observability) — Logging, tracing, metrics
- [@reaatech/hybrid-rag-qdrant](https://www.npmjs.com/package/@reaatech/hybrid-rag-qdrant) — Qdrant vector DB adapter
- [@reaatech/hybrid-rag-embedding](https://www.npmjs.com/package/@reaatech/hybrid-rag-embedding) — Provider-agnostic embeddings
- [@reaatech/hybrid-rag-ingestion](https://www.npmjs.com/package/@reaatech/hybrid-rag-ingestion) — Document loading + chunking
- [@reaatech/hybrid-rag-retrieval](https://www.npmjs.com/package/@reaatech/hybrid-rag-retrieval) — BM25, reranker, fusion
- [@reaatech/hybrid-rag-pipeline](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline) — RAGPipeline orchestrator
- [@reaatech/hybrid-rag-evaluation](https://www.npmjs.com/package/@reaatech/hybrid-rag-evaluation) — Evaluation + ablation + benchmarking
- [@reaatech/hybrid-rag-mcp-server](https://www.npmjs.com/package/@reaatech/hybrid-rag-mcp-server) — MCP server with 41+ tools
- [@reaatech/hybrid-rag-cli](https://www.npmjs.com/package/@reaatech/hybrid-rag-cli) — CLI interface

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

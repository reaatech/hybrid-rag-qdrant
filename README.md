# hybrid-rag-qdrant

[![CI](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

> Production-grade hybrid RAG (Retrieval-Augmented Generation) reference implementation with vector + BM25 + reranker, benchmarked chunking strategies, evaluation frameworks, and ablation studies.

This monorepo provides a complete RAG stack across 10 packages: core types, document ingestion with four chunking strategies, hybrid retrieval (vector + BM25 + cross-encoder reranker), evaluation with standard IR metrics, ablation studies, performance benchmarking, an MCP server with 41+ tools, and a CLI.

## Features

- **Hybrid retrieval** — semantic vector search (Qdrant) combined with BM25 keyword search, with configurable fusion strategies (RRF, weighted sum, normalized)
- **Four chunking strategies** — Fixed-Size, Semantic, Recursive, and Sliding Window with deterministic chunk IDs and strategy benchmarking
- **Cross-encoder reranking** — Cohere, Jina, OpenAI, and local provider support with cost/latency/quality tracking
- **Evaluation framework** — Precision@K, Recall@K, NDCG, MAP, MRR with per-query and aggregate results
- **Ablation studies** — YAML-configurable variant testing with delta comparisons to baseline
- **Performance benchmarking** — Latency percentiles, throughput measurement, cost breakdown, environment capture
- **MCP server** — 41+ tools across 10 categories for agent integration via Model Context Protocol
- **Cost management** — Budget configuration, cost estimation, optimization recommendations, per-component tracking
- **Quality assurance** — LLM-as-judge, hallucination detection, A/B config comparison
- **Observability** — Structured logging (Pino), OpenTelemetry tracing, metrics collection, dashboard

## Installation

### Using the packages

Packages are published under the `@reaatech` scope and can be installed individually:

```bash
# Core types and schemas
pnpm add @reaatech/hybrid-rag

# Observability (logging, tracing, metrics)
pnpm add @reaatech/hybrid-rag-observability

# Qdrant vector database adapter
pnpm add @reaatech/hybrid-rag-qdrant

# Embedding generation (OpenAI, Vertex, local)
pnpm add @reaatech/hybrid-rag-embedding

# Document loading + chunking strategies
pnpm add @reaatech/hybrid-rag-ingestion

# Retrieval engines (BM25, reranker, fusion)
pnpm add @reaatech/hybrid-rag-retrieval

# RAGPipeline orchestrator
pnpm add @reaatech/hybrid-rag-pipeline

# Evaluation + ablation + benchmarking
pnpm add @reaatech/hybrid-rag-evaluation

# MCP server with 41+ tools
pnpm add @reaatech/hybrid-rag-mcp-server

# CLI interface
pnpm add @reaatech/hybrid-rag-cli
```

### Contributing

```bash
# Clone the repository
git clone https://github.com/reaatech/hybrid-rag-qdrant.git
cd hybrid-rag-qdrant

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint

# Run type checking
pnpm typecheck
```

## Quick Start

```typescript
import { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';
import { ChunkingStrategy } from '@reaatech/hybrid-rag';

const pipeline = new RAGPipeline({
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingApiKey: process.env.OPENAI_API_KEY,
  chunkingStrategy: ChunkingStrategy.FIXED_SIZE,
  chunkSize: 512,
  chunkOverlap: 50,
  rerankerProvider: 'cohere',
  rerankerApiKey: process.env.COHERE_API_KEY,
});

await pipeline.initialize();

await pipeline.ingest([
  { id: 'doc-1', content: 'Password reset requires email verification and takes 5 minutes...' },
  { id: 'doc-2', content: 'Refund policy: requests must be submitted within 14 days...' },
]);

const results = await pipeline.query('How do I reset my password?', { topK: 5 });

for (const r of results) {
  console.log(`[${r.score.toFixed(3)}] ${r.content.substring(0, 100)}...`);
}

await pipeline.close();
```

## Packages

| Package | Description | Links |
|---------|-------------|-------|
| [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) | Core domain types, Zod schemas, shared utilities | [README](./packages/hybrid-rag/README.md) |
| [@reaatech/hybrid-rag-observability](https://www.npmjs.com/package/@reaatech/hybrid-rag-observability) | Structured logging, OpenTelemetry tracing, metrics | [README](./packages/hybrid-rag-observability/README.md) |
| [@reaatech/hybrid-rag-qdrant](https://www.npmjs.com/package/@reaatech/hybrid-rag-qdrant) | Qdrant vector database adapter | [README](./packages/hybrid-rag-qdrant/README.md) |
| [@reaatech/hybrid-rag-embedding](https://www.npmjs.com/package/@reaatech/hybrid-rag-embedding) | Provider-agnostic embedding generation | [README](./packages/hybrid-rag-embedding/README.md) |
| [@reaatech/hybrid-rag-ingestion](https://www.npmjs.com/package/@reaatech/hybrid-rag-ingestion) | Document loading + four chunking strategies | [README](./packages/hybrid-rag-ingestion/README.md) |
| [@reaatech/hybrid-rag-retrieval](https://www.npmjs.com/package/@reaatech/hybrid-rag-retrieval) | BM25, reranker, fusion, hybrid retriever | [README](./packages/hybrid-rag-retrieval/README.md) |
| [@reaatech/hybrid-rag-pipeline](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline) | RAGPipeline orchestrator | [README](./packages/hybrid-rag-pipeline/README.md) |
| [@reaatech/hybrid-rag-evaluation](https://www.npmjs.com/package/@reaatech/hybrid-rag-evaluation) | Evaluation runner, ablation studies, benchmarking | [README](./packages/hybrid-rag-evaluation/README.md) |
| [@reaatech/hybrid-rag-mcp-server](https://www.npmjs.com/package/@reaatech/hybrid-rag-mcp-server) | MCP server with 41+ agent tools | [README](./packages/hybrid-rag-mcp-server/README.md) |
| [@reaatech/hybrid-rag-cli](https://www.npmjs.com/package/@reaatech/hybrid-rag-cli) | Command-line interface | [README](./packages/hybrid-rag-cli/README.md) |

## Dependency Graph

```
hybrid-rag                        (core types, schemas, zod only)
hybrid-rag-observability          (pino, otel — standalone)
 ├── hybrid-rag-qdrant            (Qdrant adapter → core)
 ├── hybrid-rag-embedding         (embeddings → core)
 │     └── hybrid-rag-ingestion   (loading + chunking → core, observability)
 │           └── hybrid-rag-retrieval  (BM25, reranker, fusion → core, qdrant, embedding, ingestion, observability)
 │                 └── hybrid-rag-pipeline      (orchestrator → all above)
 │                       ├── hybrid-rag-evaluation   (eval + ablation + benchmarking → core, pipeline, observability)
 │                       ├── hybrid-rag-mcp-server   (MCP tools → core, pipeline, evaluation, observability)
 │                       └── hybrid-rag-cli          (CLI → pipeline, mcp-server, evaluation, ingestion)
```

## Architecture

```
Documents (PDF/MD/HTML)  ──▶  Ingestion  ──▶  Chunking Strategies
                                                      │
                                                      ▼
Queries  ──▶  Embedding  ──▶  Hybrid Retrieval (Vector + BM25)  ──▶  Reranking  ──▶  Results
                                    │
                                    ▼
                              Evaluation Framework  ──▶  Metrics
                                    │
                                    ▼
                              Ablation Studies  ──▶  Delta vs Baseline
```

## Chunking Strategies

| Strategy | Best For | Description |
|----------|----------|-------------|
| Fixed-Size | General purpose | Splits by token/word/character count with overlap |
| Semantic | Long-form content | Splits at topic boundaries using embedding similarity |
| Recursive | Structured documents | Hierarchical splitting (headers → paragraphs → sentences) |
| Sliding Window | Dense retrieval | Fixed window with configurable stride |

## Fusion Strategies

| Strategy | Formula | When to Use |
|----------|---------|-------------|
| RRF (default) | `Σ 1/(k + rank)` | No tuning required, robust across score distributions |
| Weighted Sum | `w1·s1 + w2·s2` | When scores are on similar scales |
| Normalized | `w1·norm(s1) + w2·norm(s2)` | Different score distributions |

## Reranking Providers

| Provider | Cost/Query | Quality Gain | Best For |
|----------|------------|--------------|----------|
| Cohere | ~$0.001 | +10–15% NDCG | Best quality |
| Jina | ~$0.0005 | +8–12% NDCG | Good balance |
| OpenAI | ~$0.001 | +8–10% NDCG | OpenAI ecosystem |
| Local | $0 | +5–10% NDCG | Zero cost, self-hosted |

## MCP Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| Core RAG | 4 | `rag.retrieve`, `rag.vector_search`, `rag.bm25_search`, `rag.rerank` |
| Ingestion | 3 | `rag.ingest_document`, `rag.ingest_batch`, `rag.chunk_document` |
| Evaluation | 3 | `rag.evaluate`, `rag.ablation`, `rag.benchmark` |
| Query Analysis | 3 | `rag.analyze_query`, `rag.decompose_query`, `rag.classify_intent` |
| Session Mgmt | 3 | `rag.get_context`, `rag.session_manage`, `rag.session_history` |
| Agent Integration | 4 | `rag.discover_agents`, `rag.route_to_agent`, `rag.get_agent_capabilities`, `rag.register_callback` |
| Cost Mgmt | 6 | Budget, estimate, optimize, report, controls |
| Quality | 6 | Judge, validate, hallucination detection, A/B comparison, metrics, checks |
| Observability | 6 | Metrics, traces, health check, performance, collection stats, alerts |
| Admin | 3 | Status, collections, configuration |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QDRANT_URL` | Qdrant server URL | `http://localhost:6333` |
| `QDRANT_API_KEY` | Qdrant API key | — |
| `OPENAI_API_KEY` | OpenAI API key (embeddings) | — |
| `COHERE_API_KEY` | Cohere API key (reranking) | — |
| `JINA_API_KEY` | Jina API key (reranking) | — |
| `LOG_LEVEL` | Log level | `info` |

## Performance Targets

| Metric | Target |
|--------|--------|
| P50 latency (no rerank) | < 300ms |
| P90 latency (no rerank) | < 700ms |
| P99 latency (no rerank) | < 1500ms |
| Cost per query (no rerank) | < $0.005 |

## License

[MIT](LICENSE)

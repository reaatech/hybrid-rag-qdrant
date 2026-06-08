# hybrid-rag

[![CI](https://github.com/reaatech/hybrid-rag/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/hybrid-rag/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-2.0.0-blue)](https://www.npmjs.com/package/@reaatech/hybrid-rag)

> Production-grade hybrid RAG (Retrieval-Augmented Generation) reference implementation with vector + BM25 + reranker, benchmarked chunking strategies, evaluation frameworks, and ablation studies.

This monorepo provides a complete RAG stack across 24 packages: core types, document ingestion with four chunking strategies, hybrid retrieval (vector + BM25 + cross-encoder reranker), 15 vector store providers, cross-DB migration, evaluation with standard IR metrics, ablation studies, performance benchmarking, an MCP server with 47+ tools, and a CLI.

## Features

- **Hybrid retrieval** — semantic vector search across 15 providers (Qdrant, Pinecone, Weaviate, Chroma, PgVector, Milvus, Elasticsearch, OpenSearch, Redis, MongoDB, Azure AI Search, LanceDB, Vespa, Supabase, Sandbox) combined with BM25 keyword search, with configurable fusion strategies (RRF, weighted sum, normalized)
- **Four chunking strategies** — Fixed-Size, Semantic, Recursive, and Sliding Window with deterministic chunk IDs and strategy benchmarking
- **Cross-encoder reranking** — Cohere, Jina, OpenAI, and local provider support with cost/latency/quality tracking
- **Evaluation framework** — Precision@K, Recall@K, NDCG, MAP, MRR with per-query and aggregate results
- **Ablation studies** — YAML-configurable variant testing with delta comparisons to baseline
- **Performance benchmarking** — Latency percentiles, throughput measurement, cost breakdown, environment capture
- **MCP server** — 47+ tools across 10 categories for agent integration via Model Context Protocol
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

# MCP server with 47+ tools
pnpm add @reaatech/hybrid-rag-mcp-server

# CLI interface
pnpm add @reaatech/hybrid-rag-cli

# Cross-DB vector migration
pnpm add @reaatech/hybrid-rag-migration
```

### Contributing

```bash
# Clone the repository
git clone https://github.com/reaatech/hybrid-rag.git
cd hybrid-rag

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

// Zero-config: defaults to embedded LanceDB (in-process, no server needed)
const pipeline = new RAGPipeline({});

// Or with a Qdrant server:
const pipeline = new RAGPipeline({
  vectorStore: {
    provider: 'qdrant',
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    collectionName: 'docs',
    vectorSize: 1536,
  },
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

### Supported Vector Stores

| Provider | Package | Native Hybrid | Local Dev | Best For |
|----------|---------|---------------|-----------|----------|
| LanceDB | `@reaatech/hybrid-rag-lancedb` | No | Yes (embedded) | Zero-config local dev (default) |
| Qdrant | `@reaatech/hybrid-rag-qdrant` | No | Docker | General production |
| Pinecone | `@reaatech/hybrid-rag-pinecone` | Yes (sparse-dense) | No | Managed vector infra |
| Weaviate | `@reaatech/hybrid-rag-weaviate` | Yes (alpha) | Docker | Native hybrid search |
| Chroma | `@reaatech/hybrid-rag-chroma` | No | Server required | Local dev and prototypes |
| PgVector | `@reaatech/hybrid-rag-pgvector` | No | Docker | Postgres-native deployments |
| Milvus/Zilliz | `@reaatech/hybrid-rag-milvus` | No | Docker | Open-source managed vector DB |
| Elasticsearch | `@reaatech/hybrid-rag-elasticsearch` | Yes | Docker | Enterprise search + vectors |
| OpenSearch | `@reaatech/hybrid-rag-opensearch` | Yes | Docker | Open-source search + vectors |
| Redis | `@reaatech/hybrid-rag-redis` | Yes | Docker | Low-latency cache-adjacent |
| MongoDB Atlas | `@reaatech/hybrid-rag-mongodb` | No | Atlas only | Document-centric Atlas |
| Azure AI Search | `@reaatech/hybrid-rag-azure-ai-search` | Yes | Azure | Azure enterprise managed |
| Vespa | `@reaatech/hybrid-rag-vespa` | Yes | Docker | Advanced hybrid ranking |
| Supabase | `@reaatech/hybrid-rag-supabase` | No | Managed | Supabase PgVector convenience |
| Sandbox | Built-in | No | In-memory | Dry-run testing |

See each adapter's README for config examples and setup requirements.

### Provider Selection

`RAGPipeline` defaults to LanceDB, which runs embedded in-process and stores local data under `.lancedb-data` unless configured otherwise. Use it for local development, tests, and demos where no server should be required.

Use Qdrant, PgVector, Weaviate, Elasticsearch, OpenSearch, Redis, Milvus, Vespa, or Chroma when you want a local service for integration testing through Docker Compose. Chroma is server-only in JavaScript: run `chroma run` or `docker compose --profile chroma up chroma`; there is no embedded Chroma mode in Node. Use managed providers such as Pinecone, MongoDB Atlas, Azure AI Search, or Supabase when deployment operations and scaling are handled outside this repo.

Provider limitations to account for:

| Provider | Limitation |
|----------|------------|
| Pinecone | Cannot be used as a migration source because it does not expose a scan/list-all-vectors API. Native hybrid uses deterministic sparse vectors from the shared encoder, not SPLADE. |
| Chroma | JavaScript client requires a running server; not the zero-config default. |
| LanceDB | Excellent embedded default; for multi-writer or high-concurrency production, validate the workload or select a service-backed provider. |
| Vespa | Collection/schema lifecycle is external to the adapter. |
| Supabase | Uses PgVector through Supabase RPC/table conventions; schema setup is required. |

### Migration Format

Vector export/import uses versioned NDJSON. The first line is metadata, followed by one point per line:

```jsonl
{"type":"metadata","format":"hybrid-rag-vector-export","version":"2.0.0","provider":"qdrant","collection":"documents","dimension":1536,"exportedAt":"2026-06-07T00:00:00.000Z"}
{"type":"point","point":{"id":"chunk-1","vector":[0.1,0.2],"payload":{"documentId":"doc-1"}}}
```

Treat exports as sensitive data because payload metadata can contain source text. Validate dimensions before import, and do not use a provider without `supportsScan` as the source for migration.

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
| [@reaatech/hybrid-rag-mcp-server](https://www.npmjs.com/package/@reaatech/hybrid-rag-mcp-server) | MCP server with 47+ agent tools | [README](./packages/hybrid-rag-mcp-server/README.md) |
| [@reaatech/hybrid-rag-cli](https://www.npmjs.com/package/@reaatech/hybrid-rag-cli) | Command-line interface | [README](./packages/hybrid-rag-cli/README.md) |
| [@reaatech/hybrid-rag-migration](https://www.npmjs.com/package/@reaatech/hybrid-rag-migration) | Cross-DB vector migration tools | [README](./packages/hybrid-rag-migration/README.md) |

## Dependency Graph

```
hybrid-rag                        (core types, schemas, zod only)
hybrid-rag-observability          (pino, otel — standalone)
 ├── hybrid-rag-qdrant            (Qdrant adapter → core)
 ├── hybrid-rag-pinecone          (Pinecone adapter → core)
 ├── hybrid-rag-weaviate          (Weaviate adapter → core)
 ├── hybrid-rag-chroma            (Chroma adapter → core)
 ├── hybrid-rag-pgvector          (PgVector adapter → core)
 ├── hybrid-rag-milvus            (Milvus adapter → core)
 ├── hybrid-rag-elasticsearch     (Elasticsearch adapter → core)
 ├── hybrid-rag-opensearch        (OpenSearch adapter → core)
 ├── hybrid-rag-redis             (Redis adapter → core)
 ├── hybrid-rag-mongodb           (MongoDB adapter → core)
 ├── hybrid-rag-azure-ai-search   (Azure AI Search adapter → core)
 ├── hybrid-rag-lancedb           (LanceDB adapter → core)
 ├── hybrid-rag-vespa             (Vespa adapter → core)
 ├── hybrid-rag-supabase          (Supabase adapter → core)
 ├── hybrid-rag-embedding         (embeddings → core)
 │     └── hybrid-rag-ingestion   (loading + chunking → core, observability)
 │           └── hybrid-rag-retrieval  (BM25, reranker, fusion, adapter factory, sandbox → core, adapters, embedding, ingestion, observability)
 │                 └── hybrid-rag-pipeline      (orchestrator → all above)
 │                       ├── hybrid-rag-evaluation   (eval + ablation + DB benchmarking → core, pipeline, observability)
 │                       ├── hybrid-rag-migration    (cross-DB migration → core, retrieval)
 │                       ├── hybrid-rag-mcp-server   (MCP tools → core, pipeline, evaluation, migration, observability)
 │                       └── hybrid-rag-cli          (CLI → pipeline, mcp-server, evaluation, ingestion, migration)
```

## Architecture

```
Documents (PDF/MD/HTML)  ──▶  Ingestion  ──▶  Chunking Strategies
                                                      │
                                                      ▼
                                              VectorStoreAdapter
                                        (LanceDB | Qdrant | Pinecone | ...)
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
| Evaluation | 4 | `rag.evaluate`, `rag.ablation`, `rag.benchmark`, `rag.benchmark_db` |
| Query Analysis | 3 | `rag.analyze_query`, `rag.decompose_query`, `rag.classify_intent` |
| Session Mgmt | 3 | `rag.get_context`, `rag.session_manage`, `rag.session_history` |
| Agent Integration | 4 | `rag.discover_agents`, `rag.route_to_agent`, `rag.get_agent_capabilities`, `rag.register_callback` |
| Cost Mgmt | 6 | Budget, estimate, optimize, report, controls |
| Quality | 6 | Judge, validate, hallucination detection, A/B comparison, metrics, checks |
| Observability | 6 | Metrics, traces, health check, performance, collection stats, alerts |
| Admin | 6 | Status, collections, configuration, migration, provider listing, capability detection |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HYBRID_RAG_VECTOR_STORE` | Vector store provider | `lancedb` |
| `HYBRID_RAG_QDRANT_URL` | Qdrant server URL | `http://localhost:6333` |
| `HYBRID_RAG_PINECONE_API_KEY` | Pinecone API key | — |
| `HYBRID_RAG_WEAVIATE_URL` | Weaviate server URL | — |
| `HYBRID_RAG_CHROMA_URL` | Chroma server URL; server required | `http://localhost:8000` |
| `HYBRID_RAG_LANCEDB_URI` | LanceDB data directory | `.lancedb-data` |
| `HYBRID_RAG_PGVECTOR_CONNECTION_STRING` | PgVector connection string | — |
| `HYBRID_RAG_MONGODB_CONNECTION_STRING` | MongoDB Atlas connection string | — |
| `HYBRID_RAG_AZURE_AI_SEARCH_ENDPOINT` | Azure AI Search endpoint | — |
| `HYBRID_RAG_SUPABASE_URL` | Supabase project URL | — |
| `OPENAI_API_KEY` | OpenAI API key (embeddings) | — |
| `COHERE_API_KEY` | Cohere API key (reranking) | — |
| `JINA_API_KEY` | Jina API key (reranking) | — |
| `LOG_LEVEL` | Log level | `info` |

For other vector store providers, use the `vectorStore` config option:

```typescript
vectorStore: { provider: 'qdrant' | 'pinecone' | 'weaviate' | 'chroma' | 'pgvector' | 'milvus' | 'elasticsearch' | 'opensearch' | 'redis' | 'mongodb' | 'azure-ai-search' | 'lancedb' | 'vespa' | 'supabase' | 'sandbox', ... }
```

Each provider has its own set of required env vars (e.g. `PINECONE_API_KEY`, `WEAVIATE_URL`). See the [vector store adapters skill](./skills/vector-db-adapters/skill.md) for full provider-specific documentation.

## Local Stack

The default pipeline requires no vector database service because it uses embedded LanceDB. Optional services are available through Docker Compose profiles:

```bash
docker compose --profile qdrant up qdrant
docker compose --profile chroma up chroma
docker compose --profile postgres up postgres
docker compose --profile weaviate up weaviate
```

Readiness and capability surfaces:

```bash
hybrid-rag healthcheck
hybrid-rag providers
hybrid-rag providers inspect chroma --json
```

## Performance Targets

| Metric | Target |
|--------|--------|
| P50 latency (no rerank) | < 300ms |
| P90 latency (no rerank) | < 700ms |
| P99 latency (no rerank) | < 1500ms |
| Cost per query (no rerank) | < $0.005 |

### Migrating from v0.1.x to v2.0.0

The `qdrantUrl` and `qdrantApiKey` config fields are deprecated. Use `vectorStore` instead:

```typescript
// v0.1.x (deprecated, still supported)
new RAGPipeline({ qdrantUrl: 'http://localhost:6333', collectionName: 'docs' });
// v2.0.0 (new)
new RAGPipeline({ vectorStore: { provider: 'qdrant', url: 'http://localhost:6333', collectionName: 'docs', vectorSize: 1536 } });
```

The backward-compat shim automatically converts old config fields. It will be removed in v3.0.0.

## License

[MIT](LICENSE)

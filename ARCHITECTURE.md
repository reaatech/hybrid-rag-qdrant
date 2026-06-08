# hybrid-rag — Architecture

## System Overview

This is a **pnpm monorepo** with 24 packages under `packages/*`, published to npm under the `@reaatech` scope. Each package builds independently via tsup (dual ESM/CJS output), and turbo orchestrates build ordering based on the dependency graph.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  hybrid-rag │    │  hybrid-rag │    │  MCP Client │                  │
│  │  -cli       │    │  -pipeline  │    │  (Agent)    │                  │
│  │  (npx)      │    │  (import)   │    │             │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             │                                               │
└─────────────────────────────┼─────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    RAG Pipeline (hybrid-rag-pipeline)                     │
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │   Vector    │───▶│    BM25     │───▶│  Reranker   │                  │
│  │  Retrieval  │    │  Retrieval  │    │ (Optional)  │                  │
│  │ (Adapter)   │    │  (Sparse)   │    │             │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             ▼                                             │
│                    ┌─────────────┐                                        │
│                    │   Fusion    │                                        │
│                    │  Strategy   │                                        │
│                    └─────────────┘                                        │
│                                                                          │
│  Retrieval orchestrated by @reaatech/hybrid-rag-retrieval               │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Document Processing (hybrid-rag-ingestion)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Loader     │  │  Validator  │  │ Preprocessor│  │ Chunking    │    │
│  │  (PDF/MD/   │  │  (size,     │  │ (Unicode,   │  │ Strategies  │    │
│  │   HTML/TXT) │  │   format,   │  │  whitespace)│  │ (4 types)   │    │
│  │             │  │   hash)     │  │             │  │             │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            Evaluation & Benchmarking (hybrid-rag-evaluation)              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Retrieval  │  │ Generation  │  │  Ablation   │  │ Performance │    │
│  │   Metrics   │  │   Metrics   │  │  Studies    │  │ Benchmarking│    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│           Cross-Cutting Concerns (hybrid-rag-observability)               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │   Logging (Pino) │  │ Tracing (OTel)   │  │ Metrics (OTel)   │       │
│  │  - Query lifecycle│ │  - Span per stage │  │  - Counters       │       │
│  │  - Pretty/dev     │  │  - OTLP export   │  │  - Histograms     │       │
│  │  - JSON/prod      │  │  - Error capture  │  │  - Gauges         │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Package Architecture

### Dependency Graph

```
hybrid-rag                        (core types, schemas — zod only)
hybrid-rag-observability          (pino, OTel — standalone)
  ├── hybrid-rag-qdrant           (Qdrant adapter → core)
  ├── hybrid-rag-pinecone         (Pinecone adapter → core)
  ├── hybrid-rag-weaviate         (Weaviate adapter → core)
  ├── hybrid-rag-chroma           (Chroma adapter → core)
  ├── hybrid-rag-pgvector         (PgVector adapter → core)
  ├── hybrid-rag-milvus           (Milvus/Zilliz adapter → core)
  ├── hybrid-rag-elasticsearch    (Elasticsearch adapter → core)
  ├── hybrid-rag-opensearch       (OpenSearch adapter → core)
  ├── hybrid-rag-redis            (Redis Vector adapter → core)
  ├── hybrid-rag-mongodb          (MongoDB Atlas Vector adapter → core)
  ├── hybrid-rag-azure-ai-search  (Azure AI Search adapter → core)
  ├── hybrid-rag-lancedb          (LanceDB adapter → core)
  ├── hybrid-rag-vespa            (Vespa adapter → core)
  ├── hybrid-rag-supabase         (Supabase Vector adapter → core)
  ├── hybrid-rag-embedding        (embeddings → core)
  │     └── hybrid-rag-ingestion  (loading + 4 chunking strategies → core, observability)
  │           └── hybrid-rag-retrieval (BM25, reranker, fusion, adapter factory, sandbox → core, adapters, embedding, ingestion, observability)
  │                 └── hybrid-rag-pipeline    (orchestrator → all above)
  │                       ├── hybrid-rag-evaluation (eval, ablation, benchmarking, DB benchmarking → core, pipeline, observability)
  │                       ├── hybrid-rag-migration  (cross-DB migration → core, retrieval)
  │                       ├── hybrid-rag-mcp-server (47+ MCP tools → core, pipeline, evaluation, migration, observability)
  │                       └── hybrid-rag-cli        (CLI → pipeline, mcp-server, evaluation, ingestion, migration)
```

### Package Boundaries

| Package | Responsibility | Key Classes |
|---------|---------------|-------------|
| `@reaatech/hybrid-rag` | Domain types, Zod schemas, enums, vector store contract | `Document`, `Chunk`, `ChunkingStrategy`, `RetrievalResult`, `VectorStoreAdapter` |
| `@reaatech/hybrid-rag-observability` | Logging, tracing, metrics, dashboard | `createLogger`, `TracingManager`, `MetricsCollector` |
| Adapter packages | Vector store implementations for 15 providers | `QdrantClientWrapper`, `PineconeClientWrapper`, `LanceDBClientWrapper`, etc. |
| `@reaatech/hybrid-rag-embedding` | Embedding generation (OpenAI, Vertex, local) | `EmbeddingService` |
| `@reaatech/hybrid-rag-ingestion` | Document loading, preprocessing, 4 chunking strategies | `DocumentLoader`, `ChunkingEngine`, `FixedSizeChunker` |
| `@reaatech/hybrid-rag-retrieval` | BM25, reranker, fusion, hybrid retriever, vector search engine, adapter factory, sandbox store | `HybridRetriever`, `RerankerEngine`, `BM25SearchEngine`, `createVectorStore`, `SandboxVectorStore` |
| `@reaatech/hybrid-rag-pipeline` | RAGPipeline orchestrator | `RAGPipeline` |
| `@reaatech/hybrid-rag-evaluation` | Evaluation runner, ablation, benchmarking, vector DB benchmarking | `EvaluationRunner`, `AblationRunner`, `benchmarkLatency`, `benchmarkVectorStores` |
| `@reaatech/hybrid-rag-migration` | Cross-DB scan/upsert migration and versioned export/import | `migrateVectors`, `exportVectors`, `importVectors` |
| `@reaatech/hybrid-rag-mcp-server` | MCP server + 47+ tools | `MCPServer`, `createMCPServer` |
| `@reaatech/hybrid-rag-cli` | CLI commands (commander) | `hybrid-rag`, `hybrid-rag-healthcheck` |

### Build System

| Tool | Purpose |
|------|---------|
| **pnpm** (v10) | Package manager + workspace linking |
| **turbo** | Build orchestration, caching, dependency ordering |
| **tsup** | Per-package build (TypeScript → CJS + ESM + DTS) |
| **Biome** | Linting and formatting |
| **Vitest** | Test runner with V8 coverage |
| **Changesets** | Version management and npm publishing |

---

## Design Principles

### 1. Hybrid Retrieval First
- Vector search captures semantic similarity through the configured `VectorStoreAdapter`
- BM25 captures exact keyword matching (in-process)
- Fusion combines strengths of both approaches (RRF default)
- Reranking refines top results with cross-encoder (Cohere, Jina, local)

### 2. Pluggable Vector DB
- `VectorStoreAdapter` in `@reaatech/hybrid-rag` is the contract for all vector stores.
- `@reaatech/hybrid-rag-retrieval` owns the dynamic `createVectorStore()` factory and plugin registry.
- v2 supports 15 providers: Qdrant, Pinecone, Weaviate, Chroma, PgVector, Milvus, Elasticsearch, OpenSearch, Redis, MongoDB, Azure AI Search, LanceDB, Vespa, Supabase, and Sandbox.
- LanceDB is the zero-config embedded default; Chroma is server-only in JavaScript and requires `chroma run` or Docker.
- New adapters follow the pattern defined in `skills/vector-db-adapters/skill.md`.
- Provider-agnostic embedding layer in `@reaatech/hybrid-rag-embedding`.

### 3. Benchmark-Driven Development
- Every claim backed by measured numbers
- Chunking strategies compared head-to-head via `ChunkingBenchmark`
- Ablation studies show component contributions with delta metrics
- Performance benchmarks include latency percentiles, throughput, cost

### 4. Reproducibility
- Deterministic chunk IDs (hash of document_id + strategy + index + seed)
- Versioned configurations
- Environment details captured in benchmark results
- Same inputs always produce same outputs

### 5. Cost Transparency
- Track API costs per query, per component
- Budget enforcement at per-query, daily, monthly levels
- Cost breakdown by component (embedding, vector search, reranking)
- Optimize for cost-quality tradeoff via ablation studies

---

## Component Deep Dive

### Document Ingestion Pipeline (hybrid-rag-ingestion)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Document Ingestion Pipeline                       │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │   Loader    │    │  Validator  │    │ Preprocessor│              │
│  │             │    │             │    │             │              │
│  │ - PDF       │    │ - File size │    │ - Unicode   │              │
│  │ - Markdown  │    │ - Content   │    │   normalize │              │
│  │ - HTML      │    │   type      │    │ - Whitespace│              │
│  │ - Text      │    │ - Encoding  │    │ - Headers/  │              │
│  │             │    │ - Duplicates│    │   footers   │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
│                                                                      │
│  Output: Cleaned text with metadata (title, author, date, source)   │
└─────────────────────────────────────────────────────────────────────┘
```

**Supported Formats:** PDF (pdf-parse), Markdown (marked), HTML (cheerio), Plain Text (native).

### Chunking Strategies (hybrid-rag-ingestion)

All strategies produce `Chunk[]` with deterministic IDs. The `ChunkingEngine` orchestrates routing to the correct strategy.

```
chunk_id = hash(document_id + strategy + chunk_index + seed)
```

| Strategy | Mode | Best For |
|----------|------|----------|
| Fixed-Size | Token/word/char | General purpose, predictable |
| Semantic | Sentence similarity thresholds | Long-form content, preserves meaning |
| Recursive | Hierarchical separators | Structured documents (headers → paragraphs → sentences) |
| Sliding Window | Window + stride | Dense retrieval, high overlap |

### Vector Retrieval — Adapter Factory (hybrid-rag-retrieval)

```
┌─────────────────────────────────────────────────────────────────────┐
│                 Vector Store Adapter Layer                           │
│                                                                      │
│  VectorSearchEngine ──▶ createVectorStore(config) ──▶ Adapter        │
│                                │                                     │
│                                ├── LanceDB (default, embedded)       │
│                                ├── Qdrant / PgVector / Chroma        │
│                                ├── Pinecone / Weaviate / Vespa       │
│                                ├── Elastic / OpenSearch / Redis      │
│                                ├── MongoDB / Azure / Supabase        │
│                                └── Sandbox (in-memory dry run)       │
│                                                                      │
│  Each adapter reports capabilities, cost model, stats, health,       │
│  metadata filtering support, and scan support for migration.         │
└─────────────────────────────────────────────────────────────────────┘
```

The common filter language is `StandardFilter`: simple equality, `$eq`, `$ne`, `$in`, `$nin`, numeric range operators, `$exists`, `$and`, and `$or`. Each adapter translates this to its native query language. Providers without native hybrid support use client-side BM25/vector fusion; providers with native hybrid support may use `hybridQuery`, `hybridAlpha`, or sparse vectors depending on capability.

### Embedding Service (hybrid-rag-embedding)

Provider-agnostic embedding generation with cost tracking:

| Provider | Model | Dimensions | Cost/1M tokens |
|----------|-------|------------|----------------|
| OpenAI | text-embedding-3-small | 1536 | $0.02 |
| OpenAI | text-embedding-3-large | 3072 | $0.13 |
| Vertex AI | text-embedding-004 | 768 | $0.025 |
| Local | all-MiniLM-L6-v2 | 384 | $0 (self-hosted) |

### BM25 Sparse Retrieval (hybrid-rag-retrieval)

In-process BM25 with configurable tokenization:

```
BM25 Score = IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D|/avgdl))
```

Tokenization pipeline: lowercase → whitespace split → punctuation removal → stop word removal → stemming → n-grams.

### Hybrid Fusion Strategies (hybrid-rag-retrieval)

| Strategy | Formula | When to Use |
|----------|---------|-------------|
| RRF (default) | `Σ 1/(k + rank_i)` | No tuning required, robust |
| Weighted Sum | `w1·s1 + w2·s2` | Scores on similar scales |
| Normalized | `w1·norm(s1) + w2·norm(s2)` | Different distributions |

Normalization methods: Min-Max, Z-Score, Rank.

### Reranker — Cross-Encoder (hybrid-rag-retrieval)

| Provider | Model | Cost/Request | Avg Latency |
|----------|-------|--------------|-------------|
| Cohere | rerank-english-v3.0 | $0.001 | ~500ms |
| Jina | jina-reranker-v1 | $0.0005 | ~400ms |
| Local | cross-encoder/ms-marco | $0 | ~100ms |

Reranking typically improves NDCG@10 by 10-15%.

---

## Data Flow

### Ingestion Flow

```
1. Load document (PDF/Markdown/HTML/Text)
         │
2. Validate (file size, content type, duplicate detection)
         │
3. Preprocess (Unicode normalization, whitespace, headers/footers)
         │
4. Chunk (apply strategy, generate deterministic IDs, preserve metadata)
         │
5. Embed (generate embeddings in batch, track tokens and cost)
         │
6. Index (upsert to configured vector store, build BM25 index, persist metadata)
```

### Query Flow

```
1. Receive query
         │
2. Generate query embedding (hybrid-rag-embedding)
         │
3. Parallel retrieval:
   - Vector search (configured VectorStoreAdapter)
   - BM25 search (in-process via hybrid-rag-retrieval)
         │
4. Fusion (combine using RRF/weighted/normalized)
         │
5. Rerank (optional, cross-encoder scoring on fused results)
         │
6. Return top-K results with scores, sources, and cost breakdown
```

### Evaluation Flow

```
1. Load evaluation dataset (.jsonl: queries + ground truth)
         │
2. For each query:
   - Run retrieval pipeline
   - Compare against ground truth
   - Calculate metrics (Precision@K, Recall@K, NDCG@K, MAP, MRR)
         │
3. Aggregate (mean, std dev, confidence intervals)
         │
4. (Optional) Ablation study: test each component variant
         │
5. Generate report (Markdown tables, component contributions, statistical significance)
```

---

## Security Model

### Defense in Depth

```
Layer 1: Data — PII redaction in logs, hash sensitive identifiers
Layer 2: API Keys — env vars only, never logged, per-provider isolation
Layer 3: Cost Controls — budget limits, pre-execution estimation, real-time alerts
Layer 4: Input Validation — file size limits, content type, query length, rate limiting
```

---

## Observability (hybrid-rag-observability)

### Tracing Spans

| Span | Attributes |
|------|------------|
| `rag.query` | query_id, chunking_strategy, retrieval_mode |
| `rag.embedding` | provider, model, tokens, cost |
| `rag.vector_search` | provider, operation, status, k, latency_ms |
| `rag.bm25_search` | k, terms, latency_ms |
| `rag.fusion` | strategy, candidates, latency_ms |
| `rag.rerank` | provider, model, documents, cost |

### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `rag.queries.total` | Counter | status |
| `rag.queries.duration_ms` | Histogram | component |
| `rag.retrieval.results` | Histogram | source |
| `rag.vector_store.operations` | Counter | provider, operation, status |
| `rag.reranker.calls` | Counter | provider, status |
| `rag.embeddings.generated` | Counter | provider |
| `rag.chunks.created` | Counter | strategy |

Vector-store observability uses low-cardinality labels only: `provider`, `operation`, and `status`. It must not tag query text, document IDs, collection names, namespaces, tenants, or raw error messages.

### Structured Logging

All logs are JSON with standard fields: timestamp, service, query_id, level, message, latency_ms, results_count, embedding_cost, reranker_cost, total_cost.

---

## Performance Characteristics

### Latency Budget (Target)

| Component | P50 | P90 | P99 |
|-----------|-----|-----|-----|
| Embedding generation | 200ms | 500ms | 1000ms |
| Vector search | 50ms | 100ms | 200ms |
| BM25 search | 10ms | 20ms | 50ms |
| Fusion | 5ms | 10ms | 20ms |
| Reranking (optional) | 500ms | 1000ms | 2000ms |
| **Total (with rerank)** | **765ms** | **1630ms** | **3270ms** |
| **Total (without rerank)** | **265ms** | **630ms** | **1270ms** |

### Cost Per Query (Estimated)

| Component | Cost (USD) |
|-----------|------------|
| Embedding (1 query, ~100 tokens) | $0.002 |
| Vector search (provider-dependent) | $0.000-$0.001 |
| BM25 search | $0.000 |
| Reranking (10 docs) | $0.01 |
| **Total (with rerank)** | **$0.013** |
| **Total (without rerank)** | **$0.003** |

---

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Vector store unavailable | Connection error or failed health check | Retry with backoff, return partial results from BM25 when possible |
| Embedding API error | Non-2xx response | Retry with backoff, use cached embeddings |
| Reranker API error | Timeout or error | Skip reranking, return fused results |
| Budget exceeded | Cost > limit | Stop processing, return partial results |
| Document load error | Parse failure | Log error, skip document, continue batch |
| Chunking error | Invalid config | Fall back to default fixed-size strategy |

---

## References

- **AGENTS.md** — Agent development guide
- **README.md** — Quick start and overview
- **skills/** — Skill definitions for each capability
- **packages/** — Source code organized by package
- **MCP Specification** — https://modelcontextprotocol.io/
- **Qdrant Documentation** — https://qdrant.tech/documentation/
- **LanceDB Documentation** — https://lancedb.github.io/lancedb/
- **Chroma Documentation** — https://docs.trychroma.com/

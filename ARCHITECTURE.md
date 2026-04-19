# hybrid-rag-qdrant — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │     CLI     │    │   Library   │    │  MCP Client │                  │
│  │   (npx)     │    │  (import)   │    │  (Agent)    │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             │                                               │
└─────────────────────────────┼─────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         RAG Core Engine                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Query Pipeline                               │   │
│  │                                                                   │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │   Vector    │───▶│    BM25     │───▶│  Reranker   │           │   │
│  │  │  Retrieval  │    │  Retrieval  │    │ (Optional)  │           │   │
│  │  │  (Qdrant)   │    │  (Sparse)   │    │             │           │   │
│  │  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘           │   │
│  │         │                   │                   │                 │   │
│  │         └───────────────────┼───────────────────┘                 │   │
│  │                             ▼                                     │   │
│  │                    ┌─────────────┐                                │   │
│  │                    │   Fusion    │                                │   │
│  │                    │  Strategy   │                                │   │
│  │                    └─────────────┘                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Document Processing                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Ingestion  │  │ Chunking    │  │ Embedding   │  │  Indexing   │    │
│  │  Pipeline   │  │ Strategies  │  │ Generation  │  │  (Qdrant)   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Evaluation & Benchmarking                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Retrieval  │  │ Generation  │  │  Ablation   │  │ Performance │    │
│  │   Metrics   │  │   Metrics   │  │  Studies    │  │ Benchmarking│    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Cross-Cutting Concerns                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │   Observability  │  │    Cost Track    │  │  Reproducibility │       │
│  │  - Tracing (OTel)│  │  - API costs     │  │  - Seed mgmt     │       │
│  │  - Metrics (OTel)│  │  - Per-query     │  │  - Deterministic │       │
│  │  - Logging (pino)│  │  - Budget track  │  │  - Versioning    │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Hybrid Retrieval First
- Vector search captures semantic similarity
- BM25 captures exact keyword matching
- Fusion combines strengths of both approaches
- Reranking refines top results with cross-encoder

### 2. Benchmark-Driven Development
- Every claim backed by measured numbers
- Chunking strategies compared head-to-head
- Ablation studies show component contributions
- Performance benchmarks include latency, throughput, cost

### 3. Reproducibility
- Deterministic chunking (seed-based)
- Versioned configurations
- Environment details captured in benchmarks
- Same inputs always produce same outputs

### 4. Provider-Agnostic
- Embeddings: OpenAI, Vertex AI, or local models
- Rerankers: Cohere, Jina, OpenAI, or local
- Vector DB: Qdrant (reference), but architecture supports others
- No vendor lock-in

### 5. Cost Transparency
- Track API costs per query
- Budget enforcement
- Cost breakdown by component
- Optimize for cost-quality tradeoff

---

## Component Deep Dive

### Document Ingestion Pipeline

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

**Supported Formats:**
- **PDF**: Extracted with pdf-parse, preserves text structure
- **Markdown**: Parsed with marked, preserves headers and structure
- **HTML**: Parsed with cheerio, extracts main content
- **Plain Text**: Direct loading with encoding detection

**Design Decision:** Preprocessing removes headers/footers because they often
contain noise (page numbers, copyright notices) that hurts retrieval quality.

### Chunking Strategies

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Chunking Strategies                             │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   Fixed-Size    │    │    Semantic     │    │    Recursive    │  │
│  │                 │    │                 │    │                 │  │
│  │ - Character     │    │ - Sentence      │    │ - Hierarchical  │  │
│  │ - Word          │    │ - Paragraph     │    │ - By headers    │  │
│  │ - Token         │    │ - Topic         │    │ - Paragraphs    │  │
│  │                 │    │   boundaries    │    │ - Sentences     │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  ┌─────────────────┐                                                │
│  │  Sliding Window │                                                │
│  │                 │                                                │
│  │ - Fixed window  │                                                │
│  │ - Configurable  │                                                │
│  │   stride        │                                                │
│  └─────────────────┘                                                │
│                                                                      │
│  All strategies preserve metadata and generate deterministic IDs    │
└─────────────────────────────────────────────────────────────────────┘
```

**Chunk ID Generation:**
```
chunk_id = hash(document_id + strategy + chunk_index + seed)
```
This ensures the same document always produces the same chunk IDs, enabling
reproducible experiments and cache-friendly operations.

**Design Decision:** We benchmark all four strategies because the best
strategy depends on document type and query patterns. The README includes
measured results for common scenarios.

### Vector Retrieval (Qdrant)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Vector Retrieval (Qdrant)                        │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │  Embedding  │    │  Qdrant     │    │   Search    │              │
│  │  Generator  │───▶│   Client    │───▶│  Engine     │              │
│  │             │    │             │    │             │              │
│  │ - OpenAI    │    │ - Connect   │    │ - Cosine    │              │
│  │ - Vertex AI │    │ - Upsert    │    │ - Euclidean │              │
│  │ - Local     │    │ - Search    │    │ - Dot prod  │              │
│  │             │    │ - Filter    │    │ - Metadata  │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
│                                                                      │
│  Output: Ranked list of chunks with vector similarity scores        │
└─────────────────────────────────────────────────────────────────────┘
```

**Embedding Providers:**
| Provider | Model | Dimensions | Cost/1M tokens |
|----------|-------|------------|----------------|
| OpenAI | text-embedding-3-small | 1536 | $0.02 |
| OpenAI | text-embedding-3-large | 3072 | $0.13 |
| Vertex AI | text-embedding-004 | 768 | $0.025 |
| Local | all-MiniLM-L6-v2 | 384 | $0 (self-hosted) |

**Design Decision:** We use Qdrant because it supports:
- Efficient HNSW index for approximate nearest neighbor search
- Payload filtering (metadata-based filtering)
- Sparse vector support (for future BM25 integration)
- Horizontal scaling

### BM25 Sparse Retrieval

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BM25 Sparse Retrieval                             │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │  Tokenizer  │    │   BM25      │    │   Search    │              │
│  │             │    │   Engine    │    │   Engine    │              │
│  │ - Whitespace│    │             │    │             │              │
│  │ - Stop words│    │ - Document  │    │ - Query     │              │
│  │ - Stemming  │    │   frequency │    │   parsing   │              │
│  │ - N-grams   │    │ - Term      │    │ - Score     │              │
│  │             │    │   frequency │    │   calc      │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
│                                                                      │
│  BM25 Score = IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D|/avgdl))
│                                                                      │
│  Default parameters: k1 = 1.2, b = 0.75 (tunable)                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Tokenization Pipeline:**
1. Lowercase normalization
2. Whitespace splitting
3. Punctuation removal
4. Stop word removal (optional, configurable list)
5. Stemming (optional, using compromise)
6. N-gram generation (optional, up to trigrams)

**Design Decision:** We implement BM25 in-process (not using Elasticsearch)
because it's simpler to deploy and sufficient for most use cases. For
large-scale deployments, the architecture supports swapping in Elasticsearch
or another BM25 engine.

### Hybrid Fusion Strategies

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Hybrid Fusion Strategies                         │
│                                                                      │
│  Input: Vector results (scores) + BM25 results (scores)             │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Reciprocal     │    │   Weighted      │    │  Normalized     │  │
│  │  Rank Fusion    │    │    Sum          │    │   Score         │  │
│  │  (RRF)          │    │                 │    │                 │  │
│  │                 │    │ score = w1 *    │    │ score = w1 *    │  │
│  │ score =         │    │ vector_score +  │    │ norm(vector_)   │  │
│  │ Σ 1/(k + rank_i)│    │ w2 * bm25_score │    │ score + w2 *    │  │
│  │                 │    │                 │    │ norm(bm25_score)│  │
│  │ k = 60 (default)│    │ w1 + w2 = 1     │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  Output: Fused ranking with combined scores                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Fusion Strategy Selection:**
- **RRF**: Best when you want rank-based fusion (robust to score scale)
- **Weighted Sum**: Best when scores are on similar scales
- **Normalized Score**: Best when scores have different distributions

**Design Decision:** RRF is the default because it's parameter-free and
works well across different retrieval systems without tuning.

### Reranker (Cross-Encoder)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Reranker (Cross-Encoder)                        │
│                                                                      │
│  Input: Top-K retrieved chunks (from fusion)                        │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │  Provider   │    │  Scoring    │    │  Re-rank    │              │
│  │  Selection  │    │  Engine     │    │  Engine     │              │
│  │             │    │             │    │             │              │
│  │ - Cohere    │    │ Query +     │    │ Sort by     │              │
│  │ - Jina      │    │ Document →  │    │ relevance   │              │
│  │ - OpenAI    │    │ Relevance   │    │ score       │              │
│  │ - Local     │    │ Score       │    │             │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
│                                                                      │
│  Output: Re-ranked list with cross-encoder relevance scores         │
└─────────────────────────────────────────────────────────────────────┘
```

**Reranker Providers:**
| Provider | Model | Cost/Request | Latency |
|----------|-------|--------------|---------|
| Cohere | rerank-english-v3.0 | $0.001 | ~500ms |
| Jina | jina-reranker-v1 | $0.0005 | ~400ms |
| OpenAI | gpt-4-turbo | ~$0.01 | ~2000ms |
| Local | cross-encoder/ms-marco | $0 | ~100ms |

**Design Decision:** Reranking is optional but recommended. It adds latency
and cost but significantly improves retrieval quality (typically +10-15% on
NDCG metrics). The ablation framework quantifies this for your specific use case.

---

## Data Flow

### Ingestion Flow

```
1. Load document (PDF/Markdown/HTML/Text)
        │
2. Validate:
   - File size < limit
   - Content type valid
   - Not a duplicate
        │
3. Preprocess:
   - Normalize Unicode
   - Remove headers/footers
   - Extract tables
        │
4. Chunk:
   - Apply chunking strategy
   - Generate chunk IDs
   - Preserve metadata
        │
5. Embed:
   - Generate embeddings (batch)
   - Track token usage and cost
        │
6. Index:
   - Upsert to Qdrant
   - Build BM25 index
   - Persist metadata
```

### Query Flow

```
1. Receive query
        │
2. Generate query embedding
        │
3. Parallel retrieval:
   - Vector search (Qdrant) → top-K candidates
   - BM25 search → top-K candidates
        │
4. Fusion:
   - Combine results using selected strategy
   - Normalize scores if needed
        │
5. Rerank (optional):
   - Cross-encoder scoring on fused results
   - Re-sort by relevance
        │
6. Return top-K final results with:
   - Chunk content
   - Metadata
   - Scores (vector, BM25, fused, reranked)
   - Cost breakdown
```

### Evaluation Flow

```
1. Load evaluation dataset (queries + ground truth)
        │
2. For each query:
   - Run retrieval pipeline
   - Compare results against ground truth
   - Calculate metrics (Precision@K, Recall@K, MAP, MRR, NDCG)
        │
3. Aggregate metrics:
   - Mean across all queries
   - Standard deviation
   - Confidence intervals
        │
4. (Optional) Run ablation study:
   - Test each component variant
   - Compare against baseline
   - Calculate contribution of each component
        │
5. Generate report:
   - Markdown tables
   - Charts data
   - Statistical significance
```

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Data                                                        │
│ - PII redaction in all logs                                         │
│ - Hash sensitive identifiers                                        │
│ - Never log raw document content                                    │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: API Keys                                                    │
│ - All LLM API keys from environment variables                       │
│ - Never log API keys or tokens                                      │
│ - Separate keys per provider                                        │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Cost Controls                                               │
│ - Budget limits enforced                                            │
│ - Cost estimation before expensive operations                       │
│ - Real-time cost monitoring with alerts                             │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Input Validation                                            │
│ - Document size limits                                              │
│ - Content type validation                                           │
│ - Query length limits                                               │
│ - Rate limiting on API endpoints                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### PII Handling

- Document content is never logged (only hashed identifiers)
- User identifiers are hashed before logging
- Query text is truncated in logs (first 100 chars)
- Exports are sanitized to remove PII

---

## Observability

### Tracing

Every query generates OpenTelemetry spans:

| Span | Attributes |
|------|------------|
| `rag.query` | query_id, chunking_strategy, retrieval_mode |
| `rag.embedding` | provider, model, tokens, cost |
| `rag.vector_search` | k, filter, latency_ms |
| `rag.bm25_search` | k, terms, latency_ms |
| `rag.fusion` | strategy, candidates, latency_ms |
| `rag.rerank` | provider, model, documents, cost |

### Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `rag.queries.total` | Counter | `status` | Total queries |
| `rag.queries.duration_ms` | Histogram | `component` | Query latency |
| `rag.retrieval.results` | Histogram | `source` | Results per query |
| `rag.reranker.calls` | Counter | `provider`, `status` | Reranker API calls |
| `rag.reranker.cost` | Histogram | `provider` | Reranker cost |
| `rag.embeddings.generated` | Counter | `provider` | Embeddings created |
| `rag.embeddings.cost` | Histogram | `provider` | Embedding cost |
| `rag.chunks.created` | Counter | `strategy` | Chunks created |
| `rag.evaluation.score` | Gauge | `metric` | Evaluation metric value |

### Logging

All logs are structured JSON with standard fields:

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "service": "hybrid-rag-qdrant",
  "query_id": "q-123",
  "level": "info",
  "message": "Query completed",
  "latency_ms": 245,
  "results_count": 10,
  "embedding_cost": 0.0002,
  "reranker_cost": 0.001,
  "total_cost": 0.0012
}
```

---

## Deployment Architecture

### GCP Cloud Run

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud Run Service                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  hybrid-rag-qdrant Container                  │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │    │
│  │  │ RAG       │  │ OTel      │  │ Secrets   │                │    │
│  │  │ Engine    │  │ Sidecar   │  │ Mounted   │                │    │
│  │  └───────────┘  └───────────┘  └───────────┘                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Config:                                                             │
│  - Min instances: 0 (scale to zero)                                 │
│  - Max instances: 10 (configurable)                                 │
│  - Memory: 2GB, CPU: 2 vCPU                                         │
│  - Timeout: 300s (for large ingests)                                │
│                                                                      │
│  Secrets: Secret Manager → mounted as env vars                       │
│  Observability: OTel → Cloud Monitoring / Datadog                    │
│  Vector DB: Qdrant Cloud (external)                                  │
│  Storage: GCS for documents and indices                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Qdrant Deployment

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Qdrant Cluster                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │  Qdrant 1   │    │  Qdrant 2   │    │  Qdrant 3   │              │
│  │  (Leader)   │    │ (Follower)  │    │ (Follower)  │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
│                                                                      │
│  Config:                                                             │
│  - Replication factor: 2                                            │
│  - Sharding: by collection                                          │
│  - HNSW index: m=16, ef_construct=100                               │
│  - Persistence: SSD                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Qdrant unavailable | Connection error | Retry with backoff, return partial results from BM25 |
| Embedding API error | Non-2xx response | Retry with backoff, use cached embeddings if available |
| Reranker API error | Timeout or error | Skip reranking, return fused results |
| Budget exceeded | Cost > limit | Stop processing, return partial results |
| Document load error | Parse failure | Log error, skip document, continue batch |
| Chunking error | Invalid config | Fall back to default chunking strategy |
| BM25 index missing | Index not found | Build index on-demand or return error |

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
| Vector search (Qdrant) | $0.001 |
| BM25 search | $0.000 |
| Reranking (10 docs) | $0.01 |
| **Total (with rerank)** | **$0.013** |
| **Total (without rerank)** | **$0.003** |

---

## References

- **AGENTS.md** — Agent development guide
- **DEV_PLAN.md** — Development checklist
- **README.md** — Quick start and overview
- **MCP Specification** — https://modelcontextprotocol.io/
- **Qdrant Documentation** — https://qdrant.tech/documentation/
- **BM25 Wikipedia** — https://en.wikipedia.org/wiki/Okapi_BM25

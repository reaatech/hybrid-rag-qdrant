# hybrid-rag-qdrant

A serious hybrid RAG (Retrieval-Augmented Generation) reference implementation featuring vector + BM25 + reranker, with benchmarked chunking strategies, evaluation framework, and ablation studies with measured results.

## Why This Exists

Most public RAG repositories are toys — they demonstrate concepts but lack production-grade reliability, measured benchmarks, and reproducible results. This project provides:

- **Hybrid retrieval** combining semantic (vector) and keyword (BM25) search
- **Benchmarked chunking strategies** with measured retrieval quality
- **Evaluation framework** with standard IR metrics (Precision@K, Recall@K, NDCG, MAP, MRR)
- **Ablation studies** to quantify each component's contribution
- **Cost tracking** for API-based components
- **MCP server** for agent integration

## Quick Start

### Installation

```bash
npm install hybrid-rag-qdrant
```

### Basic Usage

```typescript
import { RAGPipeline, ChunkingStrategy } from 'hybrid-rag-qdrant';

// Initialize pipeline
const pipeline = new RAGPipeline({
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  chunkingStrategy: ChunkingStrategy.FIXED_SIZE,
  chunkSize: 512,
  chunkOverlap: 50,
});

// Ingest documents
await pipeline.ingest([
  { id: 'doc-1', content: 'Your document content here...' },
]);

// Query
const results = await pipeline.query('How do I reset my password?', {
  topK: 10,
  useReranker: true,
});

console.log(results);
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Documents     │────▶│  Ingestion +     │────▶│    Chunking     │
│  (PDF/MD/HTML)  │     │  Preprocessing   │     │   Strategies    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     Queries     │────▶│  Hybrid          │────▶│   Reranking     │
│                 │     │  Retrieval       │     │  (Optional)     │
└─────────────────┘     │  (Vector + BM25) │     └─────────────────┘
                        └──────────────────┘              │
                                                         ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │   Evaluation     │◀────│    Results      │
                        │   Framework      │     │                 │
                        └──────────────────┘     └─────────────────┘
```

## Chunking Strategies

| Strategy | Best For | Description |
|----------|----------|-------------|
| **Fixed-Size** | General purpose | Splits by tokens/words/chars with overlap |
| **Semantic** | Long-form content | Splits at topic boundaries using embeddings |
| **Recursive** | Structured documents | Splits by headers, then paragraphs, then sentences |
| **Sliding Window** | Dense retrieval | Fixed window with configurable stride |

### Chunking Configuration

```typescript
import { chunkDocument, ChunkingStrategy } from 'hybrid-rag-qdrant';

const chunks = await chunkDocument(documentContent, documentId, {
  strategy: ChunkingStrategy.SEMANTIC,
  chunkSize: 512,
  overlap: 50,
  similarityThreshold: 0.5,
});
```

## Hybrid Retrieval

### Fusion Strategies

| Strategy | Formula | When to Use |
|----------|---------|-------------|
| **RRF** (default) | `Σ 1/(k + rank_i)` | No tuning required, robust |
| **Weighted Sum** | `w1 * vector + w2 * bm25` | When scores are on similar scales |
| **Normalized** | `w1 * norm(vector) + w2 * norm(bm25)` | Different score distributions |

### Configuration

```typescript
const pipeline = new RAGPipeline({
  // Vector retrieval
  qdrantUrl: process.env.QDRANT_URL,
  embeddingProvider: 'openai',
  
  // BM25 retrieval
  bm25K1: 1.2,
  bm25B: 0.75,
  
  // Fusion
  vectorWeight: 0.7,
  bm25Weight: 0.3,
});
```

## Reranking

| Provider | Cost/Query | Latency | Quality Gain |
|----------|------------|---------|--------------|
| Cohere | $0.001 | ~500ms | +10-15% NDCG |
| Jina | $0.0005 | ~400ms | +8-12% NDCG |
| Local | $0 | ~100ms | +5-10% NDCG |

```typescript
const pipeline = new RAGPipeline({
  rerankerProvider: 'cohere',
  rerankerModel: 'rerank-english-v3.0',
  rerankTopK: 10,
  rerankFinalK: 5,
});
```

## Evaluation

### Dataset Format

```jsonl
{"query_id": "q1", "query": "How do I reset my password?", "relevant_docs": ["doc-001"], "relevant_chunks": ["chunk-001-3"]}
{"query_id": "q2", "query": "What is the refund policy?", "relevant_docs": ["doc-010"], "relevant_chunks": ["chunk-010-2"]}
```

### Running Evaluation

```typescript
import { EvaluationRunner } from 'hybrid-rag-qdrant';

const runner = new EvaluationRunner(pipeline.query.bind(pipeline), {
  metrics: ['precision@10', 'recall@10', 'ndcg@10', 'map', 'mrr'],
});

const results = await runner.evaluate(dataset);
console.log(results.metrics);
// { precisionAtK: 0.75, recallAtK: 0.82, ndcgAtK: 0.78, map: 0.71, mrr: 0.85 }
```

## Ablation Studies

### Configuration (YAML)

```yaml
baseline:
  chunking: fixed-size
  chunk_size: 512
  overlap: 50
  retrieval: hybrid
  vector_weight: 0.7
  bm25_weight: 0.3
  reranker: cohere
  top_k: 10

variants:
  - name: no-reranker
    changes:
      reranker: null

  - name: vector-only
    changes:
      retrieval: vector

  - name: bm25-only
    changes:
      retrieval: bm25
```

### Sample Results

| Configuration | NDCG@10 | Δ vs Baseline | Cost/Query |
|---------------|---------|---------------|------------|
| **Baseline** | 0.78 | — | $0.013 |
| No reranker | 0.68 | -0.10 (-13%) | $0.003 |
| Vector only | 0.65 | -0.13 (-17%) | $0.003 |
| BM25 only | 0.58 | -0.20 (-26%) | $0.000 |

## CLI Reference

The package ships two supported entry points:

- `hybrid-rag` for document ingestion, querying, evaluation, benchmarking, and MCP server startup
- `hybrid-rag-healthcheck` for local Qdrant connectivity checks

Start the MCP server over stdio:

```bash
hybrid-rag server --qdrant-url http://localhost:6333 --collection documents
```

## MCP Integration

The RAG system exposes 28 agent-facing MCP tools across 6 categories, plus core retrieval, ingestion, evaluation, and admin tools:

### Query Analysis Tools
- `rag.analyze_query` — Analyze query intent and provide routing recommendations
- `rag.decompose_query` — Break down complex queries into sub-queries
- `rag.classify_intent` — Classify query intent for optimal retrieval strategy

### Session Management Tools
- `rag.session_manage` — Create, update, and manage RAG sessions
- `rag.get_context` — Retrieve conversation context for multi-turn RAG
- `rag.session_history` — Retrieve session query history

### Agent Integration Tools
- `rag.discover_agents` — Discover available agents in the multi-agent system
- `rag.route_to_agent` — Route query to specialized agent based on intent
- `rag.get_agent_capabilities` — Query capabilities of registered agents
- `rag.register_callback` — Register callback for async agent responses

### Cost Management Tools
- `rag.get_cost_estimate` — Estimate cost for a query before execution
- `rag.set_budget` — Configure budget limits for cost control
- `rag.get_budget_status` — Get current budget status and remaining capacity
- `rag.optimize_cost` — Get cost optimization recommendations
- `rag.get_cost_report` — Get detailed cost breakdown by component
- `rag.set_cost_controls` — Configure cost controls and alert settings

### Quality Tools
- `rag.judge_quality` — Use LLM-as-judge to assess retrieval result quality
- `rag.validate_results` — Validate retrieval results against quality criteria
- `rag.detect_hallucination` — Detect potential hallucinations in generated answers
- `rag.compare_configs` — A/B test different RAG configurations
- `rag.get_quality_metrics` — Get real-time quality metrics dashboard
- `rag.run_quality_check` — Run automated quality check for production queries

### Observability Tools
- `rag.get_metrics` — Get real-time system metrics including latency, throughput, and errors
- `rag.get_trace` — Retrieve OpenTelemetry trace for a specific query
- `rag.health_check` — Perform comprehensive system health check
- `rag.get_performance` — Get performance analytics and trends over time
- `rag.get_collection_stats` — Get statistics for specific Qdrant collections
- `rag.monitor_alerts` — Get active alerts and monitoring status

### Legacy Tools
- `rag.retrieve` — Hybrid retrieval with configurable parameters
- `rag.ingest_document` — Ingest a single document
- `rag.evaluate` — Run evaluation on a dataset
- `rag.ablation` — Run ablation study
- `rag.benchmark` — Run performance benchmarks

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QDRANT_URL` | Qdrant server URL | `http://localhost:6333` |
| `QDRANT_API_KEY` | Qdrant API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `COHERE_API_KEY` | Cohere API key (for reranking) | — |
| `JINA_API_KEY` | Jina API key (for reranking) | — |

## Performance Targets

| Metric | Target |
|--------|--------|
| P50 latency (no rerank) | < 300ms |
| P90 latency (no rerank) | < 700ms |
| P99 latency (no rerank) | < 1500ms |
| Cost per query (no rerank) | < $0.005 |

## License

MIT

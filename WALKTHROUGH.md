# End-to-End Walkthrough

This guide walks you through setting up, deploying, and using the hybrid-rag-qdrant system from scratch.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Ingesting Documents](#ingesting-documents)
4. [Running Queries](#running-queries)
5. [Evaluating Performance](#evaluating-performance)
6. [Running Ablation Studies](#running-ablation-studies)
7. [Deploying to Production](#deploying-to-production)
8. [MCP Server Integration](#mcp-server-integration)

---

## Prerequisites

- Node.js 22+ (use `.nvmrc`)
- Docker and Docker Compose (for local Qdrant)
- API keys: OpenAI, Cohere (optional), Jina (optional)
- GCP or AWS account (for production deployment)

---

## Local Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/your-org/hybrid-rag-qdrant.git
cd hybrid-rag-qdrant
npm install
```

### 2. Start Qdrant Locally

```bash
docker-compose up -d qdrant
```

Verify Qdrant is running:
```bash
curl http://localhost:6333/health
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required environment variables:
```bash
QDRANT_URL=http://localhost:6333
OPENAI_API_KEY=sk-...
COHERE_API_KEY=...  # Optional, for reranking
JINA_API_KEY=...    # Optional, for reranking
```

### 4. Build and Test

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

---

## Ingesting Documents

### Prepare Your Documents

Place documents in a directory. Supported formats:
- PDF files (`.pdf`)
- Markdown (`.md`)
- HTML (`.html`)
- Plain text (`.txt`)

### Ingest via CLI

```bash
# Ingest all documents from a directory
npm run cli -- ingest ./docs --chunk-size 512 --strategy fixed-size

# Preview chunking without ingesting
npm run cli -- chunk ./docs/sample.pdf --strategy semantic

# Ingest with semantic chunking
npm run cli -- ingest ./docs \
  --strategy semantic \
  --chunk-size 512 \
  --overlap 50 \
  --similarity-threshold 0.5
```

### Ingest via API

```typescript
import { RAGPipeline } from './src';

const pipeline = new RAGPipeline({
  qdrantUrl: process.env.QDRANT_URL,
  embeddingProvider: 'openai',
});

await pipeline.ingest([
  { id: 'doc-1', content: 'Your document content...' },
  { id: 'doc-2', content: 'Another document...' },
]);
```

### Chunking Strategy Comparison

| Strategy | Use Case | Command Line |
|----------|----------|--------------|
| `fixed-size` | General purpose | `--strategy fixed-size --chunk-size 512` |
| `semantic` | Long-form, topic-based | `--strategy semantic --similarity-threshold 0.5` |
| `recursive` | Structured docs (headers) | `--strategy recursive --chunk-size 512` |
| `sliding-window` | Dense retrieval | `--strategy sliding-window --window-size 512 --stride 256` |

---

## Running Queries

### Basic Query

```bash
npm run cli -- query "How do I reset my password?" --top-k 10
```

### Hybrid Retrieval with Reranking

```bash
npm run cli -- query "Explain the refund policy" \
  --top-k 20 \
  --use-reranker \
  --reranker-provider cohere \
  --rerank-final-k 5
```

### Query Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `--top-k` | Number of results before reranking | 10 |
| `--retrieval-mode` | `hybrid`, `vector`, or `bm25` | `hybrid` |
| `--vector-weight` | Weight for vector search (0-1) | 0.7 |
| `--bm25-weight` | Weight for BM25 search (0-1) | 0.3 |
| `--use-reranker` | Enable reranking | false |
| `--reranker-provider` | `cohere`, `jina`, `openai`, or `local` | `cohere` |
| `--rerank-final-k` | Final number of results after reranking | 5 |
| `--filter` | Metadata filter (JSON) | none |

### Query via API

```typescript
const results = await pipeline.query('How do I reset my password?', {
  topK: 10,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  useReranker: true,
  rerankerProvider: 'cohere',
  rerankFinalK: 5,
});

console.log(results.answer);        // Generated answer
console.log(results.retrievedChunks); // Source chunks with scores
console.log(results.metadata);        // Query metadata and timing
```

---

## Evaluating Performance

### Prepare Evaluation Dataset

Create a JSONL file with queries and expected relevant documents:

```jsonl
{"query_id": "q1", "query": "How do I reset my password?", "relevant_docs": ["doc-1"], "relevant_chunks": ["chunk-1-3"]}
{"query_id": "q2", "query": "What is the refund policy?", "relevant_docs": ["doc-2"], "relevant_chunks": ["chunk-2-1"]}
```

Or use the example dataset:
```bash
cat datasets/examples/sample.jsonl
```

### Run Evaluation

```bash
npm run cli -- evaluate datasets/examples/sample.jsonl \
  --output eval-results.json \
  --metrics precision@10,recall@10,ndcg@10,map,mrr
```

### Evaluation Metrics Explained

| Metric | What It Measures | Ideal Value |
|--------|-----------------|-------------|
| `precision@K` | Fraction of retrieved docs that are relevant | 1.0 |
| `recall@K` | Fraction of relevant docs that are retrieved | 1.0 |
| `ndcg@K` | Normalized discounted cumulative gain | 1.0 |
| `map` | Mean average precision | 1.0 |
| `mrr` | Mean reciprocal rank of first relevant doc | 1.0 |

### Evaluation via API

```typescript
import { EvaluationRunner } from './src/evaluation';

const runner = new EvaluationRunner(pipeline.query.bind(pipeline), {
  metrics: ['precision@10', 'recall@10', 'ndcg@10', 'map', 'mrr'],
});

const results = await runner.evaluate(dataset);
console.log(results.metrics);
```

---

## Running Ablation Studies

Ablation studies help quantify each component's contribution to overall performance.

### Ablation Configuration

Create `ablation.yaml`:

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

  - name: no-overlap
    changes:
      overlap: 0
```

### Run Ablation Study

```bash
npm run cli -- ablate ablation.yaml datasets/examples/sample.jsonl \
  --output ablation-results.json
```

### Sample Output

| Configuration | NDCG@10 | Δ vs Baseline | Cost/Query |
|---------------|---------|---------------|------------|
| **Baseline** | 0.78 | — | $0.013 |
| No reranker | 0.68 | -0.10 (-13%) | $0.003 |
| Vector only | 0.65 | -0.13 (-17%) | $0.003 |
| BM25 only | 0.58 | -0.20 (-26%) | $0.000 |
| No overlap | 0.72 | -0.06 (-8%) | $0.003 |

---

## Deploying to Production

### Option 1: Google Cloud Run (Recommended)

```bash
cd infra/environments/prod

# Initialize Terraform
terraform init

# Plan deployment
terraform plan \
  -var="project=your-gcp-project" \
  -var="qdrant_url=https://xyz.qdrant.cloud"

# Deploy
terraform apply \
  -var="project=your-gcp-project" \
  -var="qdrant_url=https://xyz.qdrant.cloud"
```

### Option 2: AWS ECS

```bash
cd infra/aws

terraform init
terraform plan -var="project=your-project"
terraform apply -var="project=your-project"
```

### Post-Deployment Verification

```bash
# Get the service URL
export RUN_URL=$(terraform output -raw cloud_run_url)

# Health check
curl $RUN_URL/health

# Test query
curl -X POST $RUN_URL/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test question", "topK": 5}'
```

---

## MCP Server Integration

The MCP server exposes 42+ tools for agent integration.

### Start MCP Server

```bash
npm run cli -- serve --port 3000
```

### Available Tool Categories

#### Query Analysis (3 tools)
```json
{
  "name": "rag.analyze_query",
  "arguments": {
    "query": "What are the system requirements and how do I install on Linux?"
  }
}
```

#### Session Management (3 tools)
```json
{
  "name": "rag.session_manage",
  "arguments": {
    "action": "create",
    "user_id": "user-123"
  }
}
```

#### Cost Management (6 tools)
```json
{
  "name": "rag.get_cost_estimate",
  "arguments": {
    "query": "Complex multi-part question",
    "config": {
      "useReranker": true,
      "topK": 10
    }
  }
}
```

#### Quality Assurance (6 tools)
```json
{
  "name": "rag.judge_quality",
  "arguments": {
    "query": "How do I configure SSO?",
    "results": [
      {"chunk_id": "c1", "content": "...", "score": 0.92}
    ]
  }
}
```

### Agent-to-Agent Example

```typescript
// Agent mesh routing example
const result = await agent.call('rag.route_to_agent', {
  query: 'Calculate total cost for 1000 API calls',
  target_agent: 'calculator',
  context: { source: 'rag_cost_analysis' },
  return_to_rag: true,
});
```

---

## Benchmarking

### Run Benchmarks

```bash
npm run cli -- benchmark \
  --queries benchmark-queries.jsonl \
  --concurrency 1,5,10,20 \
  --output benchmark-results.json
```

### Benchmark Output

| Concurrency | QPS | P50 | P90 | P95 | P99 |
|-------------|-----|-----|-----|-----|-----|
| 1 | 10 | 95ms | 120ms | 140ms | 180ms |
| 5 | 45 | 105ms | 145ms | 170ms | 220ms |
| 10 | 85 | 115ms | 165ms | 195ms | 280ms |
| 20 | 120 | 165ms | 250ms | 310ms | 450ms |

---

## Troubleshooting

### Common Issues

1. **Qdrant connection failed**
   - Ensure Qdrant is running: `docker-compose up -d qdrant`
   - Check `QDRANT_URL` in `.env`

2. **Embedding generation failed**
   - Verify `OPENAI_API_KEY` is set correctly
   - Check API key has available credits

3. **Reranking returns no results**
   - Ensure topK >= rerankFinalK
   - Verify reranker API key is valid

4. **High latency**
   - Use local reranker for lower latency
   - Check Qdrant is in same region as your deployment
   - Reduce topK if not using reranking

### Debug Mode

Enable verbose logging:
```bash
DEBUG=* npm run cli -- query "test"
```

### Health Check

```bash
npm run cli -- health
```

---

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details
- Read [AGENTS.md](./AGENTS.md) for agent integration patterns
- Explore [skills/](./skills/) for detailed capability documentation
- Check [DEV_PLAN.md](./DEV_PLAN.md) for development roadmap

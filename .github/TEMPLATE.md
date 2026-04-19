# Using hybrid-rag-qdrant as a Template Repository

This repository can be used as a GitHub template to bootstrap new RAG projects with production-grade hybrid retrieval capabilities.

## Creating a New Repository from Template

1. Click **"Use this template"** on the GitHub repository page
2. Enter your repository name
3. Choose visibility (public/private)
4. Click **"Create repository from template"**

## Post-Creation Setup

### 1. Update Repository Metadata

Update `package.json`:
```json
{
  "name": "your-rag-project",
  "description": "Your project description",
  "license": "MIT"
}
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Required environment variables:
- `QDRANT_URL` — Your Qdrant instance URL
- `OPENAI_API_KEY` — For embeddings (or use alternative provider)
- `COHERE_API_KEY` — For reranking (optional)

### 3. Set Up Qdrant

Deploy Qdrant or use Qdrant Cloud:
```bash
# Using Docker
docker run -p 6333:6333 qdrant/qdrant

# Or use Qdrant Cloud
# Get URL and API key from cloud.qdrant.tech
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Create Evaluation Dataset

Create your evaluation dataset in `datasets/eval.jsonl`:
```jsonl
{"query_id": "q1", "query": "Your query here", "relevant_chunks": ["chunk-1", "chunk-2"]}
```

### 6. Run Evaluation

```bash
# Evaluate baseline configuration
npx hybrid-rag-qdrant evaluate \
  --dataset datasets/eval.jsonl \
  --output eval-results.json

# Run ablation study
npx hybrid-rag-qdrant ablate \
  --config datasets/examples/config.yaml \
  --dataset datasets/eval.jsonl \
  --output ablation-results.json
```

### 7. Customize Chunking Strategy

Edit the chunking configuration in your code:
```typescript
const pipeline = new RAGPipeline({
  chunkingStrategy: ChunkingStrategy.SEMANTIC, // or FIXED, RECURSIVE, SLIDING
  chunkSize: 512,
  overlap: 50,
});
```

### 8. Configure CI/CD

The template includes GitHub Actions workflows. Update them for your needs:
- `.github/workflows/ci.yml` — PR checks
- `.github/workflows/release.yml` — Release automation
- `.github/workflows/eval.yml` — Evaluation on PR

### 9. Deploy

#### Docker Deployment

```bash
docker build -t your-rag-project .
docker run -p 3000:3000 --env-file .env your-rag-project
```

#### Cloud Run Deployment

```bash
gcloud run deploy your-rag-project \
  --image gcr.io/your-project/your-rag-project \
  --platform managed \
  --region us-central1 \
  --set-env-vars QDRANT_URL=your-qdrant-url
```

## Architecture Decisions to Customize

### Embedding Provider
Choose based on your needs:
- **OpenAI** — Best quality, higher cost
- **Vertex AI** — Good balance, GCP integration
- **Local** — Free, self-hosted

### Reranker Provider
- **Cohere** — Best quality, ~$0.001/query
- **Jina** — Good quality, ~$0.0005/query
- **Local** — Free, lower quality

### Fusion Strategy
- **RRF** (default) — No tuning required, robust
- **Weighted Sum** — Requires weight optimization
- **Normalized** — For different score distributions

## Performance Tuning

### Latency Optimization
1. Use smaller chunk sizes (256-512)
2. Reduce top_k if possible
3. Skip reranking for low-latency requirements
4. Use cached embeddings

### Quality Optimization
1. Benchmark chunking strategies on your documents
2. Run ablation studies to find optimal configuration
3. Tune fusion weights for your query patterns
4. Use reranking for critical applications

### Cost Optimization
1. Use local embeddings for high volume
2. Skip reranking when quality is acceptable
3. Use smaller embedding models
4. Implement query caching

## Monitoring

The template includes OpenTelemetry instrumentation. Configure your observability backend:

```bash
# Set OTLP endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT=http://your-collector:4318

# Run with tracing enabled
node dist/index.js
```

## Support

- **Documentation**: See README.md, AGENTS.md, ARCHITECTURE.md
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

## License

This template is released under the MIT License.

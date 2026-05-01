# @reaatech/hybrid-rag-cli

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-cli.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Command-line interface for hybrid RAG systems. Provides commands for document ingestion, querying, evaluation, ablation studies, benchmarking, chunking preview, and MCP server startup.

## Installation

```bash
npm install -g @reaatech/hybrid-rag-cli
# or
pnpm add -g @reaatech/hybrid-rag-cli
```

### Binaries

| Binary | Description |
|--------|-------------|
| `hybrid-rag` | Main CLI with all commands |
| `hybrid-rag-healthcheck` | Qdrant connectivity check for container orchestration |

## Commands

### `hybrid-rag server`

Start the MCP server over stdio.

```bash
hybrid-rag server \
  --qdrant-url http://localhost:6333 \
  --collection documents \
  --config rag-config.yaml
```

| Option | Description |
|--------|-------------|
| `--qdrant-url <url>` | Qdrant server URL |
| `--collection <name>` | Qdrant collection name (default: `documents`) |
| `--config <path>` | YAML config file for pipeline settings |

### `hybrid-rag ingest`

Ingest documents into the knowledge base.

```bash
hybrid-rag ingest ./docs/*.pdf ./docs/*.md \
  --qdrant-url http://localhost:6333 \
  --strategy semantic \
  --chunk-size 512 \
  --overlap 50
```

| Option | Description |
|--------|-------------|
| `--qdrant-url <url>` | Qdrant server URL |
| `--collection <name>` | Target collection (default: `documents`) |
| `--strategy <name>` | Chunking strategy: `fixed-size`, `semantic`, `recursive`, `sliding-window` |
| `--chunk-size <n>` | Chunk size in tokens (default: 512) |
| `--overlap <n>` | Overlap in tokens (default: 50) |
| `--config <path>` | YAML config file for pipeline settings |

### `hybrid-rag query`

Query the knowledge base.

```bash
hybrid-rag query "How do I reset my password?" \
  --top-k 10 \
  --reranker cohere \
  --mode hybrid \
  --output json
```

| Option | Description |
|--------|-------------|
| `--qdrant-url <url>` | Qdrant server URL |
| `--top-k <n>` | Number of results (default: 10) |
| `--reranker <provider>` | Reranker: `cohere`, `jina`, `openai`, `local`, or `none` |
| `--mode <mode>` | Retrieval mode: `hybrid`, `vector`, `bm25` (default: `hybrid`) |
| `--vector-weight <n>` | Vector score weight (default: 0.7) |
| `--bm25-weight <n>` | BM25 score weight (default: 0.3) |
| `--filter <json>` | JSON metadata filter |
| `--output <format>` | Output format: `text`, `json`, `table` (default: `text`) |
| `--config <path>` | YAML config file |

### `hybrid-rag evaluate`

Run evaluation on a dataset.

```bash
hybrid-rag evaluate \
  --dataset ./datasets/eval.jsonl \
  --metrics precision@10,recall@10,ndcg@10,map,mrr \
  --output eval-results.json
```

| Option | Description |
|--------|-------------|
| `--dataset <path>` | Path to `.jsonl` evaluation dataset |
| `--metrics <list>` | Comma-separated metrics (default: all) |
| `--top-k <n>` | K value for @K metrics (default: 10) |
| `--output <path>` | Output file for results JSON |

### `hybrid-rag ablate`

Run an ablation study.

```bash
hybrid-rag ablate \
  --config ./ablation-config.yaml \
  --dataset ./datasets/eval.jsonl \
  --output ablation-results.json
```

| Option | Description |
|--------|-------------|
| `--config <path>` | YAML ablation config file |
| `--dataset <path>` | Path to `.jsonl` evaluation dataset |
| `--output <path>` | Output file for results JSON |

### `hybrid-rag benchmark`

Run performance benchmarks.

```bash
hybrid-rag benchmark \
  --queries 100 \
  --iterations 50 \
  --warmup 10 \
  --concurrent 5 \
  --output benchmark-report.md
```

| Option | Description |
|--------|-------------|
| `--queries <n>` | Number of queries to run (default: 100) |
| `--iterations <n>` | Measurement iterations (default: 50) |
| `--warmup <n>` | Warmup iterations (default: 10) |
| `--concurrent <n>` | Concurrent query count (default: 1) |
| `--output <path>` | Output file for Markdown report |

### `hybrid-rag chunk`

Preview chunking strategies on a document.

```bash
hybrid-rag chunk ./docs/report.pdf \
  --strategy semantic \
  --chunk-size 512 \
  --overlap 50 \
  --output chunks.json
```

| Option | Description |
|--------|-------------|
| `--strategy <name>` | Chunking strategy (default: `fixed-size`) |
| `--chunk-size <n>` | Chunk size in tokens (default: 512) |
| `--overlap <n>` | Overlap in tokens (default: 50) |
| `--output <path>` | Output file for chunk data |

### `hybrid-rag-healthcheck`

Verify Qdrant connectivity. Returns exit code 0 on success, 1 on failure.

```bash
hybrid-rag-healthcheck --qdrant-url http://localhost:6333
```

## Configuration File (YAML)

All commands accept a `--config` flag to load pipeline settings from YAML:

```yaml
qdrantUrl: http://localhost:6333
collectionName: documents

embeddingProvider: openai
embeddingModel: text-embedding-3-small
embeddingApiKey: ${OPENAI_API_KEY}

chunkingStrategy: semantic
chunkSize: 512
chunkOverlap: 50

useHybrid: true
vectorWeight: 0.7
bm25Weight: 0.3
fusionStrategy: rrf

rerankerProvider: cohere
rerankerModel: rerank-english-v3.0
rerankerApiKey: ${COHERE_API_KEY}
rerankTopK: 20
rerankFinalK: 10

topK: 10
bm25K1: 1.2
bm25B: 0.75
```

Environment variable references (e.g. `${OPENAI_API_KEY}`) are resolved at runtime.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `QDRANT_URL` | Qdrant server URL | `http://localhost:6333` |
| `QDRANT_API_KEY` | Qdrant API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `COHERE_API_KEY` | Cohere API key (for reranking) | — |
| `JINA_API_KEY` | Jina API key (for reranking) | — |
| `LOG_LEVEL` | Log level | `info` |

## Related Packages

- [@reaatech/hybrid-rag-pipeline](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline) — RAGPipeline (core dependency)
- [@reaatech/hybrid-rag-mcp-server](https://www.npmjs.com/package/@reaatech/hybrid-rag-mcp-server) — MCP server (used by `server` command)
- [@reaatech/hybrid-rag-evaluation](https://www.npmjs.com/package/@reaatech/hybrid-rag-evaluation) — Evaluation + benchmarking
- [@reaatech/hybrid-rag-ingestion](https://www.npmjs.com/package/@reaatech/hybrid-rag-ingestion) — Document loading + chunking

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

# @reaatech/hybrid-rag-mcp-server

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-mcp-server.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

MCP (Model Context Protocol) server exposing 41+ tools for hybrid RAG integration with AI agent systems. Provides tool categories for retrieval, ingestion, evaluation, query analysis, session management, agent integration, cost management, quality assurance, observability, and administration.

## Installation

```bash
npm install @reaatech/hybrid-rag-mcp-server @modelcontextprotocol/sdk
# or
pnpm add @reaatech/hybrid-rag-mcp-server @modelcontextprotocol/sdk
```

## Feature Overview

- **41+ MCP tools** across 10 categories covering the full RAG lifecycle
- **Transport flexibility** — stdio, HTTP, and SSE transport support
- **Query analysis** — intent classification, query decomposition, routing recommendations
- **Session management** — multi-turn conversation context with session create/update/history
- **Agent integration** — discover agents, route to specialized agents, register callbacks
- **Cost management** — budget configuration, cost estimation, optimization, reporting
- **Quality assurance** — LLM-as-judge, hallucination detection, A/B config comparison
- **Observability** — real-time metrics, trace retrieval, health check, collection stats
- **Input validation** — Zod-based request validation with structured error responses

## Quick Start

### Start the MCP Server (stdio)

```typescript
import { createMCPServer } from '@reaatech/hybrid-rag-mcp-server';
import { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

const pipeline = new RAGPipeline({
  qdrantUrl: process.env.QDRANT_URL,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
});

const server = createMCPServer({
  pipeline,
  transport: 'stdio',
});

await server.start();
```

### Start via CLI

```bash
hybrid-rag server --qdrant-url http://localhost:6333 --collection documents
```

## API Reference

### `createMCPServer(config)`

Creates and configures an MCP server instance with all tools registered.

#### `MCPServerConfig`

| Property | Type | Description |
|----------|------|-------------|
| `pipeline` | `RAGPipeline` | Configured RAG pipeline instance |
| `transport` | `'stdio' \| 'http' \| 'sse'` | Transport layer |
| `port` | `number` | Port for HTTP/SSE transport (default: 3000) |
| `host` | `string` | Host for HTTP/SSE transport (default: 'localhost') |

### Tool Categories

#### Core RAG Tools (4 tools)

| Tool | Description |
|------|-------------|
| `rag.retrieve` | Execute hybrid retrieval (vector + BM25) with optional reranking |
| `rag.vector_search` | Execute vector-only semantic search |
| `rag.bm25_search` | Execute BM25 keyword-only search |
| `rag.rerank` | Rerank existing retrieval results using cross-encoder |

#### Ingestion Tools (3 tools)

| Tool | Description |
|------|-------------|
| `rag.ingest_document` | Ingest a single document |
| `rag.ingest_batch` | Batch process multiple documents |
| `rag.chunk_document` | Preview chunking strategies on a document |

#### Evaluation Tools (3 tools)

| Tool | Description |
|------|-------------|
| `rag.evaluate` | Run evaluation on a dataset |
| `rag.ablation` | Execute ablation study |
| `rag.benchmark` | Run performance benchmarks |

#### Query Analysis Tools (3 tools)

| Tool | Description |
|------|-------------|
| `rag.analyze_query` | Query intent analysis and routing recommendation |
| `rag.decompose_query` | Multi-step query decomposition for complex questions |
| `rag.classify_intent` | Classify query intent for optimal retrieval strategy |

#### Session Management Tools (3 tools)

| Tool | Description |
|------|-------------|
| `rag.get_context` | Retrieve conversation context for multi-turn RAG |
| `rag.session_manage` | Create, update, and manage RAG sessions |
| `rag.session_history` | Retrieve session query history |

#### Agent Integration Tools (4 tools)

| Tool | Description |
|------|-------------|
| `rag.discover_agents` | Discover available agents in agent-mesh |
| `rag.route_to_agent` | Route query to specialized agent based on intent |
| `rag.get_agent_capabilities` | Query capabilities of registered agents |
| `rag.register_callback` | Register callback for async agent responses |

#### Cost Management Tools (6 tools)

| Tool | Description |
|------|-------------|
| `rag.get_cost_estimate` | Estimate cost for a query before execution |
| `rag.set_budget` | Configure budget limits (per-query, daily, monthly) |
| `rag.get_budget_status` | Current budget status and remaining capacity |
| `rag.optimize_cost` | Get cost optimization recommendations |
| `rag.get_cost_report` | Detailed cost breakdown by component |
| `rag.set_cost_controls` | Configure cost controls and alerts |

#### Quality Tools (6 tools)

| Tool | Description |
|------|-------------|
| `rag.judge_quality` | LLM-as-judge for result quality assessment |
| `rag.validate_results` | Validate retrieval results against quality criteria |
| `rag.detect_hallucination` | Detect potential hallucinations in results |
| `rag.compare_configs` | A/B test different RAG configurations |
| `rag.get_quality_metrics` | Real-time quality metrics dashboard |
| `rag.run_quality_check` | Run automated quality check for production queries |

#### Observability Tools (6 tools)

| Tool | Description |
|------|-------------|
| `rag.get_metrics` | Real-time system metrics (latency, throughput, errors) |
| `rag.get_trace` | Retrieve OpenTelemetry trace for a query |
| `rag.health_check` | Comprehensive system health status |
| `rag.get_performance` | Performance analytics and trends over time |
| `rag.get_collection_stats` | Statistics for specific Qdrant collections |
| `rag.monitor_alerts` | Active alerts and monitoring status |

#### Admin Tools (3 tools)

| Tool | Description |
|------|-------------|
| `rag.status` | System status and health overview |
| `rag.collections` | Qdrant collection management |
| `rag.config` | Configuration management and inspection |

## Usage Patterns

### Retrieval with Full Configuration

```json
{
  "name": "rag.retrieve",
  "arguments": {
    "query": "How do I reset my password?",
    "topK": 10,
    "retrievalMode": "hybrid",
    "vectorWeight": 0.7,
    "bm25Weight": 0.3,
    "useReranker": true,
    "rerankerProvider": "cohere",
    "filter": { "department": "engineering" }
  }
}
```

### Multi-Turn Conversation

```json
// Create a session
{ "name": "rag.session_manage", "arguments": { "action": "create", "user_id": "user-123" } }

// Query with session context
{ "name": "rag.retrieve", "arguments": { "query": "What about macOS?", "session_id": "sess-abc", "use_context": true } }
```

### Cost-Aware Querying

```json
// Check budget first
{ "name": "rag.get_budget_status", "arguments": { "scope": { "user_id": "team-alpha" } } }

// If budget allows, use full config; otherwise use cheaper retrieval
{ "name": "rag.retrieve", "arguments": { "query": "...", "useReranker": false, "topK": 5 } }
```

### Quality Check

```json
{
  "name": "rag.judge_quality",
  "arguments": {
    "query": "How do I configure SSO?",
    "results": [
      { "chunk_id": "chunk-001", "content": "...", "score": 0.92 }
    ],
    "judge_model": "claude-opus",
    "criteria": ["relevance", "completeness"],
    "consensus_count": 3
  }
}
```

## Related Packages

- [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) — Core types
- [@reaatech/hybrid-rag-pipeline](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline) — RAGPipeline (required dependency)
- [@reaatech/hybrid-rag-evaluation](https://www.npmjs.com/package/@reaatech/hybrid-rag-evaluation) — Evaluation tools
- [@reaatech/hybrid-rag-observability](https://www.npmjs.com/package/@reaatech/hybrid-rag-observability) — Structured logging

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

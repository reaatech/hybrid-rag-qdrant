---
agent_id: "hybrid-rag-qdrant"
display_name: "Hybrid RAG (Qdrant)"
version: "0.1.0"
description: "Hybrid search RAG implementation using Qdrant vector database"
type: "mcp"
confidence_threshold: 0.9
---

# hybrid-rag-qdrant — Agent Development Guide

## What this is

This document defines how to use `hybrid-rag-qdrant` to build production-grade RAG (Retrieval-Augmented Generation) systems with comprehensive MCP tool integration. It covers the complete pipeline: document ingestion, chunking strategies, hybrid retrieval (vector + BM25), reranking, evaluation frameworks, ablation studies, cost management, quality assurance, and multi-agent orchestration.

**Target audience:** Engineers building enterprise RAG systems and AI agents who need reproducible results, benchmarked performance, cost-aware deployment, and seamless integration with multi-agent systems like agent-mesh.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Documents     │────▶│  Ingestion +     │────▶│    Chunking     │
│  (PDF/MD/HTML) │     │  Preprocessing   │     │   Strategies    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Agents     │◀───▶│  MCP Server      │────▶│   Hybrid       │
│  (agent-mesh)   │     │  (55 Tools)      │     │   Retrieval    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Cost + Quality  │
                        │  Management      │
                        └──────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Document Ingestion** | `src/ingestion/` | Multi-format loading and preprocessing |
| **Chunking Strategies** | `src/chunking/` | Fixed, semantic, recursive, sliding-window |
| **Vector Retrieval** | `src/retrieval/vector/` | Qdrant + provider-agnostic embeddings |
| **BM25 Retrieval** | `src/retrieval/bm25/` | Keyword-based sparse retrieval |
| **Reranker** | `src/retrieval/reranker/` | Cross-encoder scoring (Cohere, Jina, local) |
| **Hybrid Fusion** | `src/retrieval/fusion/` | RRF, weighted sum, normalized fusion |
| **Evaluation** | `src/evaluation/` | Retrieval metrics, ablation studies |
| **Benchmarking** | `src/benchmarking/` | Latency, throughput, cost measurement |
| **MCP Server** | `src/mcp-server/` | 41 tools across 10 modules |

---

## MCP Tool Categories

The MCP server exposes **41 tools** across 10 categories:

### 1. Core RAG Tools (4 tools)
| Tool | Description |
|------|-------------|
| `rag.retrieve` | Execute hybrid retrieval (vector + BM25) with optional reranking |
| `rag.vector_search` | Execute vector-only semantic search |
| `rag.bm25_search` | Execute BM25 keyword-only search |
| `rag.rerank` | Rerank existing retrieval results using cross-encoder |

### 2. Ingestion Tools (3 tools)
| Tool | Description |
|------|-------------|
| `rag.ingest_document` | Ingest a single document |
| `rag.ingest_batch` | Batch process multiple documents |
| `rag.chunk_document` | Preview chunking strategies on a document |

### 3. Evaluation Tools (3 tools)
| Tool | Description |
|------|-------------|
| `rag.evaluate` | Run evaluation on a dataset |
| `rag.ablation` | Execute ablation study |
| `rag.benchmark` | Run performance benchmarks |

### 4. Query Analysis Tools (3 tools)
| Tool | Description |
|------|-------------|
| `rag.analyze_query` | Query intent analysis and routing recommendation |
| `rag.decompose_query` | Multi-step query decomposition for complex questions |
| `rag.classify_intent` | Classify query intent for optimal retrieval strategy |

### 5. Session Management Tools (3 tools)
| Tool | Description |
|------|-------------|
| `rag.get_context` | Retrieve conversation context for multi-turn RAG |
| `rag.session_manage` | Create, update, and manage RAG sessions |
| `rag.session_history` | Retrieve session query history |

### 6. Agent Integration Tools (4 tools)
| Tool | Description |
|------|-------------|
| `rag.discover_agents` | Discover available agents in agent-mesh |
| `rag.route_to_agent` | Route query to specialized agent based on intent |
| `rag.get_agent_capabilities` | Query capabilities of registered agents |
| `rag.register_callback` | Register callback for async agent responses |

### 7. Cost Management Tools (6 tools)
| Tool | Description |
|------|-------------|
| `rag.get_cost_estimate` | Estimate cost for a query before execution |
| `rag.set_budget` | Configure budget limits (per-query, daily, monthly) |
| `rag.get_budget_status` | Current budget status and remaining capacity |
| `rag.optimize_cost` | Get cost optimization recommendations |
| `rag.get_cost_report` | Detailed cost breakdown by component |
| `rag.set_cost_controls` | Configure cost controls and alerts |

### 8. Quality Tools (6 tools)
| Tool | Description |
|------|-------------|
| `rag.judge_quality` | LLM-as-judge for result quality assessment |
| `rag.validate_results` | Validate retrieval results against quality criteria |
| `rag.detect_hallucination` | Detect potential hallucinations in results |
| `rag.compare_configs` | A/B test different RAG configurations |
| `rag.get_quality_metrics` | Real-time quality metrics dashboard |
| `rag.run_quality_check` | Run automated quality check for production queries |

### 9. Observability Tools (6 tools)
| Tool | Description |
|------|-------------|
| `rag.get_metrics` | Real-time system metrics |
| `rag.get_trace` | Retrieve OpenTelemetry trace for a query |
| `rag.health_check` | Comprehensive system health status |
| `rag.get_performance` | Performance analytics and trends |
| `rag.get_collection_stats` | Statistics for specific collections |
| `rag.monitor_alerts` | Active alerts and monitoring status |

### 10. Admin Tools (3 tools)
| Tool | Description |
|------|-------------|
| `rag.status` | System status and health |
| `rag.collections` | Qdrant collection management |
| `rag.config` | Configuration management |

---

## Skill System

Skills represent the atomic capabilities of the RAG system. Each skill corresponds to a component of the pipeline.

### Core RAG Skills

| Skill ID | File | Description |
|----------|------|-------------|
| `document-ingestion` | `skills/document-ingestion/skill.md` | Multi-format document loading |
| `chunking-strategies` | `skills/chunking-strategies/skill.md` | Configurable chunking with benchmarks |
| `vector-retrieval` | `skills/vector-retrieval/skill.md` | Qdrant vector search |
| `bm25-retrieval` | `skills/bm25-retrieval/skill.md` | BM25 keyword search |
| `reranker` | `skills/reranker/skill.md` | Cross-encoder reranking |
| `hybrid-fusion` | `skills/hybrid-fusion/skill.md` | Score fusion strategies |
| `rag-evaluation` | `skills/rag-evaluation/skill.md` | Retrieval quality metrics |
| `ablation-studies` | `skills/ablation-studies/skill.md` | Component contribution analysis |
| `benchmarking` | `skills/benchmarking/skill.md` | Performance measurement |

### Agent & MCP Skills

| Skill ID | File | Description |
|----------|------|-------------|
| `query-analysis` | `skills/query-analysis/skill.md` | Query intent analysis and decomposition |
| `cost-management` | `skills/cost-management/skill.md` | Cost tracking, budgeting, and optimization |
| `agent-integration` | `skills/agent-integration/skill.md` | Multi-agent orchestration and agent-mesh integration |
| `quality-scoring` | `skills/quality-scoring/skill.md` | LLM-as-judge for RAG quality assurance |
| `session-management` | `skills/session-management/skill.md` | Multi-turn conversation context management |

---

## MCP Integration

### Basic Retrieval

Execute hybrid retrieval with full configuration:

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

### Query Analysis & Intent Classification

Analyze query intent before retrieval:

```json
{
  "name": "rag.analyze_query",
  "arguments": {
    "query": "What are the system requirements and how do I install on Linux?",
    "context": {
      "user_tier": "enterprise",
      "previous_queries": ["installation guide"]
    }
  }
}
```

Response includes:
- Detected intent (e.g., "technical_documentation", "troubleshooting")
- Recommended retrieval strategy
- Suggested filters and weights
- Confidence score

### Multi-Turn Conversation Management

Maintain context across multiple queries:

```json
{
  "name": "rag.session_manage",
  "arguments": {
    "action": "create",
    "user_id": "user-123",
    "metadata": {
      "domain": "technical_support",
      "priority": "high"
    }
  }
}
```

Subsequent queries with session context:

```json
{
  "name": "rag.retrieve",
  "arguments": {
    "query": "What about macOS?",
    "session_id": "session-abc-123",
    "use_context": true
  }
}
```

### Cost Management

Set and monitor budgets:

```json
{
  "name": "rag.set_budget",
  "arguments": {
    "budget_type": "daily",
    "limit": 50.00,
    "alert_thresholds": [0.5, 0.75, 0.9],
    "hard_limit": true,
    "scope": {
      "user_id": "team-alpha",
      "project": "production-rag"
    }
  }
}
```

Check budget status:

```json
{
  "name": "rag.get_budget_status",
  "arguments": {
    "scope": {
      "user_id": "team-alpha"
    }
  }
}
```

### Quality Assurance with LLM-as-Judge

Validate retrieval quality:

```json
{
  "name": "rag.judge_quality",
  "arguments": {
    "query": "How do I configure SSO?",
    "results": [
      {"chunk_id": "chunk-001", "content": "SSO configuration requires SAML 2.0 setup...", "score": 0.92},
      {"chunk_id": "chunk-002", "content": "Identity provider settings for SSO...", "score": 0.87}
    ],
    "judge_model": "claude-opus",
    "criteria": ["relevance", "completeness", "accuracy"],
    "consensus_count": 3
  }
}
```

### Hallucination Detection

Detect potential hallucinations in results:

```json
{
  "name": "rag.detect_hallucination",
  "arguments": {
    "query": "What is the refund policy?",
    "generated_answer": "Refunds are processed within 30 days.",
    "retrieved_chunks": [
      {"content": "Refund requests must be submitted within 14 days.", "source": "policy-doc-v2"},
      {"content": "Processing time is 5-7 business days.", "source": "finance-faq"}
    ],
    "threshold": 0.7
  }
}
```

---

## Using with Multi-Agent Systems

### Integration with agent-mesh

Register hybrid-rag-qdrant as an agent in agent-mesh:

```yaml
# agents/hybrid-rag.yaml
agent_id: hybrid-rag-qdrant
display_name: Hybrid RAG System
description: >-
  Enterprise-grade RAG system with hybrid retrieval (vector + BM25),
  reranking, evaluation frameworks, and cost management.
  Supports multi-turn conversations and agent-to-agent orchestration.
endpoint: "${HYBRID_RAG_ENDPOINT:-http://localhost:8080}"
type: mcp
is_default: true
confidence_threshold: 0.85
capabilities:
  - document_search
  - knowledge_retrieval
  - semantic_search
  - multi_turn_qa
examples:
  - "Search the knowledge base for API documentation"
  - "Find information about authentication methods"
  - "What's our deployment process?"
routing_rules:
  - intent: technical_question
    weight: 1.0
  - intent: general_chat
    weight: 0.3
```

### Agent-to-Agent Workflow

```
User Query → agent-mesh (orchestrator)
                  │
                  ▼
           Query Analysis (rag.analyze_query)
                  │
                  ▼
           Intent Classification
                  │
         ┌────────┴────────┐
         ▼                 ▼
    hybrid-rag        Other Agent
    (knowledge)       (specialized)
         │                 │
         └────────┬────────┘
                  ▼
           Response Aggregation
```

### Cross-Agent Communication

Example: RAG system delegating to a calculator agent:

```json
{
  "name": "rag.route_to_agent",
  "arguments": {
    "query": "Calculate the total cost for 1000 API calls",
    "target_agent": "calculator",
    "context": {
      "cost_per_call": 0.002,
      "source": "rag_cost_analysis"
    },
    "return_to_rag": true
  }
}
```

### Discovering Available Agents

```json
{
  "name": "rag.discover_agents",
  "arguments": {
    "filter": {
      "capabilities": ["calculation", "data_analysis"]
    }
  }
}
```

---

## Agent Workflow Patterns

### Pattern 1: Query Analysis → Retrieval → Quality Check

```typescript
// Step 1: Analyze query intent
const analysis = await agent.call('rag.analyze_query', {
  query: 'How do I integrate with Slack?',
});

// Step 2: Execute retrieval with optimized parameters
const results = await agent.call('rag.retrieve', {
  query: 'How do I integrate with Slack?',
  ...analysis.recommended_config,
});

// Step 3: Validate quality
const quality = await agent.call('rag.judge_quality', {
  query: 'How do I integrate with Slack?',
  results: results,
});

if (quality.score < 0.8) {
  // Escalate to human or try alternative strategy
}
```

### Pattern 2: Multi-Turn Conversation with Context

```typescript
// Create session
const session = await agent.call('rag.session_manage', {
  action: 'create',
  user_id: 'user-456',
});

// First query
const r1 = await agent.call('rag.retrieve', {
  query: 'What are the API rate limits?',
  session_id: session.id,
});

// Follow-up query (context-aware)
const r2 = await agent.call('rag.retrieve', {
  query: 'What about enterprise plans?',
  session_id: session.id,
  use_context: true,
});
```

### Pattern 3: Cost-Aware Retrieval

```typescript
// Check budget before expensive operation
const budget = await agent.call('rag.get_budget_status', {
  scope: { user_id: 'team-alpha' },
});

if (budget.remaining < 1.00) {
  // Use cheaper retrieval strategy
  return await agent.call('rag.retrieve', {
    query: userQuery,
    useReranker: false,
    topK: 5,
  });
}

// Full-featured retrieval
return await agent.call('rag.retrieve', {
  query: userQuery,
  useReranker: true,
  rerankerProvider: 'cohere',
  topK: 10,
});
```

### Pattern 4: A/B Testing Configurations

```typescript
// Compare two RAG configurations
const configA = await agent.call('rag.retrieve', {
  query: testQuery,
  retrievalMode: 'hybrid',
  vectorWeight: 0.7,
  bm25Weight: 0.3,
});

const configB = await agent.call('rag.retrieve', {
  query: testQuery,
  retrievalMode: 'hybrid',
  vectorWeight: 0.5,
  bm25Weight: 0.5,
});

const comparison = await agent.call('rag.compare_configs', {
  query: testQuery,
  config_a_results: configA,
  config_b_results: configB,
  metric: 'relevance',
});
```

---

## Cost Management

### Budget Configuration

```yaml
# budget-config.yaml
budgets:
  default:
    daily_limit: 50.00
    per_query_limit: 0.10
    alert_thresholds: [0.5, 0.75, 0.9]
    hard_limit: true

  premium:
    daily_limit: 200.00
    per_query_limit: 0.50
    alert_thresholds: [0.25, 0.5, 0.75]
    hard_limit: false
```

### Cost Estimation

Before executing a query, estimate the cost:

```json
{
  "name": "rag.get_cost_estimate",
  "arguments": {
    "query": "Complex multi-part question about system architecture",
    "config": {
      "useReranker": true,
      "rerankerProvider": "cohere",
      "topK": 10,
      "embeddingModel": "text-embedding-3-small"
    }
  }
}
```

### Cost Optimization Recommendations

```json
{
  "name": "rag.optimize_cost",
  "arguments": {
    "current_config": {
      "useReranker": true,
      "rerankerProvider": "cohere",
      "topK": 20
    },
    "target_quality": 0.8,
    "budget_constraint": 0.05
  }
}
```

---

## Quality Assurance

### LLM-as-Judge Configuration

```yaml
# judge-config.yaml
judge:
  model: claude-opus
  consensus_count: 3
  max_cost_per_evaluation: 0.10
  criteria:
    - name: relevance
      weight: 0.4
    - name: completeness
      weight: 0.3
    - name: accuracy
      weight: 0.3
```

### Automated Quality Checks

```json
{
  "name": "rag.run_quality_check",
  "arguments": {
    "sample_size": 100,
    "frequency": "daily",
    "thresholds": {
      "min_relevance": 0.7,
      "min_completeness": 0.6,
      "max_hallucination_rate": 0.05
    },
    "alert_on_failure": true
  }
}
```

---

## Security Considerations

### PII Handling

- **Never log raw document content** — only hashed identifiers
- **Query text truncated in logs** — first 100 characters only
- **Exports sanitized** — PII removed before export
- **Session data encrypted** — conversation context protected

### API Key Management

- All LLM API keys from environment variables
- Never log API keys or tokens
- Separate keys per provider for isolation
- Key rotation supported without downtime

### Cost Controls

```typescript
const pipeline = new RAGPipeline({
  // ... config
  costControls: {
    maxCostPerQuery: 0.05,
    maxCostPerDay: 100.00,
    alertThresholds: [0.5, 0.75, 0.9],
    hardLimit: true,
  },
});
```

---

## Observability

### Structured Logging

Every query is logged with:

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "service": "hybrid-rag-qdrant",
  "query_id": "q-123",
  "session_id": "sess-456",
  "level": "info",
  "message": "Query completed",
  "latency_ms": 245,
  "results_count": 10,
  "embedding_cost": 0.0002,
  "reranker_cost": 0.001,
  "total_cost": 0.0012,
  "quality_score": 0.87
}
```

### OpenTelemetry Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rag.queries.total` | Counter | Total queries by type |
| `rag.queries.duration_ms` | Histogram | Query latency |
| `rag.retrieval.results` | Histogram | Results per query |
| `rag.reranker.calls` | Counter | Reranker API calls |
| `rag.cost.total` | Counter | Total cost accumulated |
| `rag.quality.score` | Gauge | Latest quality score |
| `rag.sessions.active` | Gauge | Active conversation sessions |
| `rag.agents.discovered` | Gauge | Number of available agents |

---

## Checklist: Production Readiness

Before deploying a RAG system to production:

- [ ] Evaluation dataset created with representative queries
- [ ] Baseline metrics established (NDCG@10, Precision@10, Recall@10)
- [ ] Ablation study completed to justify component choices
- [ ] Latency benchmarks meet SLA requirements
- [ ] Cost per query within budget
- [ ] Budget limits configured with appropriate thresholds
- [ ] Cost controls enabled with hard limits
- [ ] Quality thresholds defined and validated
- [ ] LLM-as-judge configured for critical paths
- [ ] Hallucination detection enabled for sensitive queries
- [ ] Multi-turn session management tested
- [ ] Agent-mesh integration verified
- [ ] PII handling verified in logs
- [ ] Observability (tracing, metrics, logging) enabled
- [ ] Error handling tested for all failure modes
- [ ] Rate limiting configured for API providers
- [ ] Fallback strategies defined for agent failures

---

## References

- **ARCHITECTURE.md** — System design deep dive
- **DEV_PLAN.md** — Development checklist
- **README.md** — Quick start and overview
- **skills/** — Skill definitions for each capability
- **MCP Specification** — https://modelcontextprotocol.io/
- **Qdrant Documentation** — https://qdrant.tech/documentation/
- **agent-mesh/AGENTS.md** — Multi-agent orchestration patterns

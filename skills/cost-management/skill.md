# Skill: Cost Management

## Overview

Cost management provides comprehensive tracking, budgeting, and optimization of RAG system costs. This skill enables cost-aware retrieval decisions, budget enforcement, and detailed cost reporting for enterprise deployments.

## Capabilities

### Cost Tracking

Track costs across all RAG components in real-time:

| Component | Cost Factors |
|-----------|-------------|
| Embeddings | Tokens × model pricing |
| Vector Store | DB operations (varies by provider) |
| Vector Search | Vector similarity queries |
| BM25 Search | CPU/memory usage |
| Reranking | API calls × provider pricing |
| LLM-as-Judge | Judge model tokens |

### Vector Store Cost Tracking

Each adapter exposes its own `VectorStoreCostModel` for provider-specific pricing:

```typescript
import type { VectorStoreCostModel } from '@reaatech/hybrid-rag-retrieval';
// Access via any adapter:
const costModel: VectorStoreCostModel = adapter.getCostModel();
// {
//   provider: 'pinecone',
//   pricingModel: 'per-node',
//   costPerQuery: 0.00001,
//   costPerUpsert: 0.00005,
//   costPerGbMonth: 0.33,
//   estimatedMonthlyCost: (vectors, dims) => ...
// }
```

Per-provider breakdown:

| Provider | Pricing Model | Query Cost | Notes |
|----------|--------------|------------|-------|
| Qdrant | Free (self-hosted) | $0 | Infrastructure cost only |
| Chroma | Free (self-hosted) | $0 | Infrastructure cost only |
| PgVector | Free (self-hosted) | $0 | Infrastructure cost only |
| Milvus | Free (self-hosted) | $0 | Infrastructure cost only |
| Weaviate | Free (self-hosted) | $0 | Cloud: per-hour + per-DU |
| Pinecone | Per-node | ~$0.00001 | Serverless: per-RU |
| MongoDB Atlas | Per-query | ~$0.00002 | Atlas Vector Search pricing |
| Elasticsearch | Per-node | $0 (self-hosted) | Elastic Cloud: per-resource |
| Azure AI Search | Per-DU (dimension) | ~$0.00003 | Azure resource pricing |
| Supabase | Per-compute | ~$0.00001 | Compute add-on for pgvector |
| LanceDB | Free (embedded) | $0 | Embedded, no server needed |
| Redis | Free (self-hosted) | $0 | Redis Cloud: per-database |
| Vespa | Free (self-hosted) | $0 | Managed Vespa: per-node |
| OpenSearch | Free (self-hosted) | $0 | AWS OpenSearch: per-instance |

The cost manager aggregates vector store costs alongside embeddings, reranking, and judge costs for a complete view.

### Budget Management

Configure and enforce budget limits at multiple levels:

```typescript
import { BudgetManager } from '@reaatech/hybrid-rag-mcp-server';

const budgetManager = new BudgetManager({
  budgets: {
    'team-alpha': {
      daily_limit: 50.00,
      per_query_limit: 0.10,
      alert_thresholds: [0.5, 0.75, 0.9],
      hard_limit: true,
    },
    'enterprise': {
      daily_limit: 500.00,
      per_query_limit: 0.50,
      alert_thresholds: [0.25, 0.5, 0.75],
      hard_limit: false,
    },
  },
});

// Check before expensive operation
const canProceed = await budgetManager.checkBudget('team-alpha', estimatedCost);
```

### Cost Estimation

Estimate query cost before execution:

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

### Budget Configuration MCP Tool

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

### Budget Status MCP Tool

```json
{
  "name": "rag.get_budget_status",
  "arguments": {
    "scope": {
      "user_id": "team-alpha"
    },
    "period": "today"
  }
}
```

### Cost Optimization MCP Tool

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

## Usage Patterns

### Cost-Aware Retrieval

```typescript
// Check budget before expensive operation
const budget = await pipeline.getBudgetStatus({ userId: 'team-alpha' });

if (budget.remaining < 1.00) {
  // Use cheaper retrieval strategy
  return await pipeline.query(userQuery, {
    useReranker: false,
    topK: 5,
    retrievalMode: 'vector-only',
  });
}

// Full-featured retrieval
return await pipeline.query(userQuery, {
  useReranker: true,
  rerankerProvider: 'cohere',
  topK: 10,
});
```

### Per-Query Cost Controls

```typescript
const pipeline = new RAGPipeline({
  // ... config
  costControls: {
    maxCostPerQuery: 0.05,
    maxCostPerDay: 100.00,
    alertThresholds: [0.5, 0.75, 0.9],
    hardLimit: true,
    costEstimationEnabled: true,
  },
});
```

### Cost Report Generation

```json
{
  "name": "rag.get_cost_report",
  "arguments": {
    "period": "week",
    "group_by": ["component", "user", "project"],
    "include_trends": true,
    "format": "detailed"
  }
}
```

## Cost Optimization Strategies

| Strategy | Savings | Quality Impact |
|----------|---------|----------------|
| Skip reranking for simple queries | 30-50% | Low |
| Use local reranker instead of API | 80-90% | Medium |
| Reduce topK for exploratory queries | 20-40% | Low-Medium |
| Cache embeddings for common queries | 10-30% | None |
| Use cheaper embedding model | 50-70% | Medium |

## Best Practices

1. **Set hard limits for production** — Prevent runaway costs
2. **Monitor cost per query trends** — Detect optimization opportunities
3. **Use cost estimation before expensive operations** — Make informed decisions
4. **Implement tiered retrieval strategies** — Match cost to query complexity
5. **Track costs by user/team/project** — Enable chargeback and accountability

## Related Skills

- `query-analysis` — Use analysis to route to cost-appropriate strategies
- `quality-scoring` — Balance cost vs quality tradeoffs
- `benchmarking` — Measure cost performance over time

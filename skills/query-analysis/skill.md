# Skill: Query Analysis

## Overview

Query analysis is the capability to understand, classify, and decompose user queries before executing retrieval. This skill enables intelligent routing, optimal retrieval strategy selection, and multi-step query handling for complex questions.

## Capabilities

### Query Intent Classification

Classify queries into intent categories to optimize retrieval strategy:

| Intent | Description | Recommended Strategy |
|--------|-------------|---------------------|
| `factual` | Specific fact-seeking questions | Vector-heavy retrieval |
| `procedural` | How-to and step-by-step questions | Hybrid with BM25 boost |
| `comparative` | Comparison questions | Hybrid with reranking |
| `exploratory` | Broad topic exploration | Diverse result set |
| `troubleshooting` | Problem-solving queries | Recent/updated content boost |
| `definitional` | Definition/terminology questions | Precise vector matching |

### Query Decomposition

Break complex queries into sub-queries for multi-step retrieval:

```typescript
import { QueryDecomposer } from '@reaatech/hybrid-rag-mcp-server';

const decomposer = new QueryDecomposer({
  maxDepth: 3,
  minSubQueryConfidence: 0.7,
});

const decomposition = await decomposer.decompose(
  'What are the system requirements and how do I install on Linux?'
);

// Returns:
// {
//   subQueries: [
//     { query: 'system requirements', weight: 0.5 },
//     { query: 'install Linux', weight: 0.5 }
//   ],
//   strategy: 'parallel',
//   aggregation: 'concatenate'
// }
```

### Query Analysis MCP Tool

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

### Intent Classification MCP Tool

```json
{
  "name": "rag.classify_intent",
  "arguments": {
    "query": "How do I reset my password?",
    "candidates": ["factual", "procedural", "troubleshooting"]
  }
}
```

## Usage Patterns

### Pre-Retrieval Analysis

```typescript
const analysis = await pipeline.analyzeQuery(query, {
  classifyIntent: true,
  decomposeIfComplex: true,
  suggestFilters: true,
});

// Use analysis to optimize retrieval
const results = await pipeline.query(query, {
  ...analysis.recommendedConfig,
});
```

### Multi-Step Query Handling

```typescript
const decomposition = await pipeline.decomposeQuery(complexQuery);

const subResults = await Promise.all(
  decomposition.subQueries.map(sq => 
    pipeline.query(sq.query, { topK: Math.ceil(10 / decomposition.subQueries.length) })
  )
);

const aggregated = pipeline.aggregateResults(subResults, decomposition.aggregation);
```

## Best Practices

1. **Always analyze before expensive operations** — Use query analysis to avoid wasteful retrieval
2. **Cache analysis results** — Same query patterns should reuse analysis
3. **Combine with cost management** — Route simple queries to cheaper strategies
4. **Log analysis decisions** — Track intent classifications for model improvement

## Related Skills

- `cost-management` — Use analysis to optimize costs
- `agent-integration` — Route based on detected intent
- `session-management` — Use conversation context in analysis

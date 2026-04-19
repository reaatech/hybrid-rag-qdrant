# Skill: Quality Scoring

## Overview

Quality scoring provides LLM-as-judge capabilities for assessing and validating RAG retrieval results. This skill enables automated quality assurance, hallucination detection, and continuous quality monitoring for production RAG systems.

## Capabilities

### LLM-as-Judge Evaluation

Use LLMs to evaluate retrieval result quality across multiple criteria:

```typescript
import { QualityJudge } from 'hybrid-rag-qdrant';

const judge = new QualityJudge({
  model: 'claude-opus',
  consensusCount: 3,
  maxCostPerEvaluation: 0.10,
  criteria: [
    { name: 'relevance', weight: 0.4 },
    { name: 'completeness', weight: 0.3 },
    { name: 'accuracy', weight: 0.3 },
  ],
});

const evaluation = await judge.evaluate({
  query: 'How do I configure SSO?',
  results: retrievedChunks,
});

// Returns:
// {
//   overallScore: 0.87,
//   criteriaScores: { relevance: 0.9, completeness: 0.8, accuracy: 0.9 },
//   consensusReached: true,
//   cost: 0.045,
//   feedback: 'Results are highly relevant and accurate...'
// }
```

### Hallucination Detection

Detect when generated answers are not supported by retrieved context:

```typescript
import { HallucinationDetector } from 'hybrid-rag-qdrant';

const detector = new HallucinationDetector({
  model: 'claude-opus',
  threshold: 0.7,
});

const detection = await detector.detect({
  query: 'What is the refund policy?',
  generatedAnswer: 'Refunds are processed within 30 days.',
  retrievedChunks: [
    { content: 'Refund requests must be submitted within 14 days.' },
    { content: 'Processing time is 5-7 business days.' },
  ],
});

// Returns:
// {
//   isHallucination: true,
//   confidence: 0.85,
//   unsupportedClaims: ['processed within 30 days'],
//   evidence: 'Source says 14 days submission + 5-7 days processing'
// }
```

### Result Validation

Validate retrieval results against quality criteria:

```json
{
  "name": "rag.validate_results",
  "arguments": {
    "query": "How do I configure SSO?",
    "results": [
      {"chunk_id": "chunk-001", "content": "...", "score": 0.92},
      {"chunk_id": "chunk-002", "content": "...", "score": 0.87}
    ],
    "criteria": {
      "minRelevance": 0.7,
      "minCompleteness": 0.6,
      "maxAge": "30d"
    }
  }
}
```

### Quality Judgment MCP Tool

```json
{
  "name": "rag.judge_quality",
  "arguments": {
    "query": "How do I configure SSO?",
    "results": [
      {"chunk_id": "chunk-001", "content": "...", "score": 0.92},
      {"chunk_id": "chunk-002", "content": "...", "score": 0.87}
    ],
    "judge_model": "claude-opus",
    "criteria": ["relevance", "completeness", "accuracy"],
    "consensus_count": 3
  }
}
```

### Hallucination Detection MCP Tool

```json
{
  "name": "rag.detect_hallucination",
  "arguments": {
    "query": "What is the refund policy?",
    "generated_answer": "Refunds are processed within 30 days.",
    "retrieved_chunks": [
      {"content": "Refund requests must be submitted within 14 days.", ...},
      {"content": "Processing time is 5-7 business days.", ...}
    ],
    "threshold": 0.7
  }
}
```

### Automated Quality Checks MCP Tool

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

## Usage Patterns

### Quality Gate Before Response

```typescript
// Retrieve results
const results = await pipeline.query(userQuery, { topK: 10 });

// Validate quality
const validation = await pipeline.validateResults({
  query: userQuery,
  results: results,
  criteria: { minRelevance: 0.7 },
});

if (validation.passed) {
  return formatResponse(results);
} else {
  // Try alternative strategy or escalate
  return await handleQualityFailure(userQuery, validation);
}
```

### Continuous Quality Monitoring

```typescript
// Run daily quality checks
const qualityCheck = await pipeline.runQualityCheck({
  sampleSize: 100,
  frequency: 'daily',
  thresholds: {
    minRelevance: 0.7,
    minCompleteness: 0.6,
    maxHallucinationRate: 0.05,
  },
  alertOnFailure: true,
});

if (!qualityCheck.passed) {
  // Trigger alert and investigation
  await alertTeam('RAG quality degradation detected', qualityCheck);
}
```

### A/B Testing Configurations

```json
{
  "name": "rag.compare_configs",
  "arguments": {
    "query": "Test query for comparison",
    "config_a_results": [...],
    "config_b_results": [...],
    "metric": "relevance",
    "judge_model": "claude-opus"
  }
}
```

## Quality Criteria Definitions

| Criterion | Description | Measurement |
|-----------|-------------|-------------|
| **Relevance** | How well results match query intent | LLM judgment 0-1 |
| **Completeness** | Whether results cover all query aspects | LLM judgment 0-1 |
| **Accuracy** | Factual correctness of information | Fact-checking against source |
| **Freshness** | How recent the information is | Document timestamp analysis |
| **Diversity** | Variety of perspectives/sources | Source distribution analysis |

## Quality Thresholds

| Use Case | Min Relevance | Min Completeness | Max Hallucination Rate |
|----------|---------------|------------------|------------------------|
| **Critical (legal, medical)** | 0.9 | 0.85 | 0.01 |
| **Production (customer-facing)** | 0.8 | 0.7 | 0.05 |
| **Internal (employee tools)** | 0.7 | 0.6 | 0.10 |
| **Exploratory (research)** | 0.6 | 0.5 | 0.15 |

## Best Practices

1. **Use consensus voting for critical decisions** — Multiple judges reduce errors
2. **Set appropriate thresholds per use case** — Not all queries need the same quality bar
3. **Monitor quality trends over time** — Detect degradation early
4. **Combine automated and human evaluation** — LLM-as-judge + human review for critical paths
5. **Track quality costs** — Balance quality improvement with evaluation costs

## Related Skills

- `rag-evaluation` — Offline evaluation with labeled datasets
- `cost-management` — Balance quality vs cost tradeoffs
- `benchmarking` — Measure quality performance over time

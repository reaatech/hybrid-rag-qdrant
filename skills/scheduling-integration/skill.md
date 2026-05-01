# Skill: Scheduling Integration

## Overview

Scheduled evaluation and quality jobs for production RAG systems. This skill enables automated periodic evaluation runs, quality checks, and reporting without manual intervention.

## Capabilities

### Scheduled Evaluation

Configure recurring evaluation jobs:

```typescript
import { Scheduler } from '@reaatech/hybrid-rag-mcp-server';

const scheduler = new Scheduler({
  storage: 'redis',
  timezone: 'UTC',
});

await scheduler.schedule('weekly-eval', {
  cron: '0 0 * * 0', // Every Sunday at midnight
  job: {
    type: 'evaluation',
    config: {
      dataset: 'datasets/production-eval.jsonl',
      metrics: ['precision@10', 'recall@10', 'ndcg@10', 'map', 'mrr'],
      topK: 10,
    },
  },
  alert_on_failure: true,
  retention_days: 90,
});
```

### Scheduled Quality Checks

```typescript
await scheduler.schedule('daily-quality', {
  cron: '0 6 * * *', // Every day at 6 AM
  job: {
    type: 'quality_check',
    config: {
      sample_size: 100,
      thresholds: {
        min_relevance: 0.7,
        min_completeness: 0.6,
        max_hallucination_rate: 0.05,
      },
    },
  },
  alert_on_failure: true,
});
```

### Scheduled Ablation Studies

```typescript
await scheduler.schedule('monthly-ablation', {
  cron: '0 0 1 * *', // First day of every month
  job: {
    type: 'ablation',
    config: {
      config_path: 'ablation/monthly-config.yaml',
      dataset: 'datasets/production-eval.jsonl',
    },
  },
  retention_days: 365,
});
```

## Schedule Management

### List Scheduled Jobs

```typescript
const jobs = await scheduler.listJobs({
  status: 'active',
  type: 'evaluation',
});
```

### View Job History

```typescript
const history = await scheduler.getJobHistory('weekly-eval', {
  limit: 10,
  include_results: true,
});
```

### Pause and Resume

```typescript
await scheduler.pauseJob('weekly-eval');
await scheduler.resumeJob('weekly-eval');
```

### Delete Schedule

```typescript
await scheduler.deleteJob('weekly-eval');
```

## Configuration

```yaml
# scheduler-config.yaml
scheduler:
  storage: redis
  redis_url: ${REDIS_URL}
  timezone: UTC
  max_concurrent_jobs: 3
  
  default_retention:
    evaluation: 90d
    quality_check: 30d
    ablation: 365d
  
  alerting:
    enabled: true
    channels:
      - type: slack
        webhook: ${SLACK_WEBHOOK}
      - type: email
        recipients: ['rag-team@example.com']
  
  notifications:
    on_success: false
    on_failure: true
    on_degradation: true  # Quality below threshold
```

## Job Types

| Job Type | Description | Frequency |
|----------|-------------|-----------|
| `evaluation` | Full evaluation run on dataset | Weekly recommended |
| `quality_check` | Production sample quality check | Daily recommended |
| `ablation` | Component contribution analysis | Monthly or on config change |
| `benchmark` | Performance benchmarking | Monthly or on deploy |
| `health_check` | System health verification | Hourly recommended |

## Job Results

### Evaluation Job Result

```typescript
{
  job_id: 'weekly-eval',
  run_at: '2026-04-28T00:00:00Z',
  status: 'completed',
  result: {
    summary: {
      precisionAtK: 0.75,
      recallAtK: 0.82,
      ndcgAtK: 0.78,
      map: 0.71,
      mrr: 0.85,
    },
    compared_to_previous: {
      ndcgAtK: { delta: +0.02, trend: 'improving' },
      map: { delta: 0.00, trend: 'stable' },
    },
  },
}
```

### Quality Check Job Result

```typescript
{
  job_id: 'daily-quality',
  run_at: '2026-04-28T06:00:00Z',
  status: 'completed',
  result: {
    passed: true,
    sample_size: 100,
    scores: {
      avg_relevance: 0.82,
      avg_completeness: 0.76,
      hallucination_rate: 0.03,
    },
    alerts: [],
  },
}
```

## Alerting

| Alert Condition | Severity | Action |
|-----------------|----------|--------|
| Quality below threshold | Warning | Notify team, pause cache |
| Quality severely degraded | Critical | Notify on-call, disable reranker |
| Evaluation job failed | Error | Notify team, retry with backoff |
| Cost exceeded budget | Warning | Reduce topK, skip reranker |
| Health check failed | Critical | Notify on-call, trigger failover |

## Best Practices

1. **Run evaluations weekly** — catch quality regressions early
2. **Run quality checks daily** — monitor production degradation
3. **Keep history for trend analysis** — 90 days minimum
4. **Alert on degradation, not just failure** — catch subtle drops
5. **Auto-scale sample sizes** — more queries → larger sample for statistical significance
6. **Version your datasets** — track which dataset version produced which results
7. **Store results alongside config** — know exactly what config produced each result

## Related Skills

- `rag-evaluation` — Evaluation metrics and framework
- `ablation-studies` — Component contribution analysis
- `quality-scoring` — LLM-as-judge for quality assessment
- `cost-management` — Budget tracking and alerts
- `benchmarking` — Performance measurement

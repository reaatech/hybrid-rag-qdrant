# @reaatech/hybrid-rag-observability

[![npm version](https://img.shields.io/npm/v/@reaatech/hybrid-rag-observability.svg)](https://www.npmjs.com/package/@reaatech/hybrid-rag-observability)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/hybrid-rag-qdrant/ci.yml?branch=main&label=CI)](https://github.com/reaatech/hybrid-rag-qdrant/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Structured logging, OpenTelemetry tracing, and metrics collection for hybrid RAG systems. Built on [Pino](https://github.com/pinojs/pino) for logging and [OpenTelemetry](https://opentelemetry.io/) for distributed tracing and metrics.

## Installation

```bash
npm install @reaatech/hybrid-rag-observability
# or
pnpm add @reaatech/hybrid-rag-observability
```

## Feature Overview

- **Structured JSON logging** — Pino-powered with configurable log levels and pretty-print for development
- **Query lifecycle logging** — pre-built helpers for logging query start, completion, error, ingestion, and evaluation
- **OpenTelemetry tracing** — trace spans across embedding, vector search, BM25 search, fusion, and reranking
- **OTLP export** — ship traces to any OTLP-compatible collector (Jaeger, Honeycomb, Datadog)
- **Metrics collection** — pre-configured counters and histograms for queries, reranker calls, embeddings, chunks, and costs
- **Dashboard metrics** — in-memory dashboard with system health, performance, retrieval, quality, cost, and usage stats
- **Global singletons** — optional global logger, tracing manager, and metrics collector for convenience

## Quick Start

```typescript
import {
  createLogger,
  getTracingManager,
  getMetricsCollector,
  logQueryStart,
  logQueryComplete,
} from '@reaatech/hybrid-rag-observability';

// Structured logging
const logger = createLogger({ level: 'debug', prettyPrint: true });
logger.info({ queryId: 'q-001' }, 'Pipeline initialized');

// Query tracing
const tracing = getTracingManager();
const span = tracing.startQuerySpan('q-001', 'How do I reset my password?');
await withSpan(span, async () => {
  // Your operation — span captures duration and errors
});

// Metrics
const metrics = getMetricsCollector();
metrics.recordQuery('success');
metrics.recordQueryDuration(245);
metrics.recordRetrievalResults(10);
metrics.recordRerankerCall('cohere', 0.001);
```

## API Reference

### Logging

#### `createLogger(config?: LoggerConfig): Logger`

Creates a configured Pino logger instance.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `level` | `LogLevel` | `'info'` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `prettyPrint` | `boolean` | `false` | Enable pino-pretty for human-readable output |

#### Query Helpers

| Function | Description |
|----------|-------------|
| `logQueryStart(logger, queryId, query)` | Log query initiation (truncates query to 100 chars) |
| `logQueryComplete(logger, queryId, fields)` | Log query completion with latency, results, cost |
| `logQueryError(logger, queryId, error)` | Log query failure with stack trace |
| `logIngestionStart(logger, documentCount)` | Log ingestion start |
| `logIngestionComplete(logger, docCount, chunkCount, latencyMs)` | Log ingestion completion |
| `logEvaluationResults(logger, metrics)` | Log evaluation run results |
| `createQueryLogger(parent, queryId)` | Create a child logger with queryId context |
| `getLogger()` | Get or create the global logger instance |

### Tracing

#### `TracingManager`

| Method | Description |
|--------|-------------|
| `initialize()` | Register the NodeTracerProvider with OTLP/console exporters |
| `startQuerySpan(queryId, query)` | Start a `rag.query` span with query attributes |
| `startEmbeddingSpan(provider, model, tokenCount)` | Start a `rag.embedding` span |
| `startVectorSearchSpan(k, filter?)` | Start a `rag.vector_search` span |
| `startBM25SearchSpan(k, terms)` | Start a `rag.bm25_search` span |
| `startFusionSpan(strategy, candidateCount)` | Start a `rag.fusion` span |
| `startRerankSpan(provider, documentCount)` | Start a `rag.rerank` span |
| `shutdown()` | Flush and shutdown the tracing provider |

#### `withSpan<T>(span, fn)`

Execute a function within a span context. Automatically sets span status to OK on success or ERROR on failure, and records exceptions.

#### `getTracingManager()`

Returns the global `TracingManager` singleton.

### Metrics

#### `MetricsCollector`

| Method | Description |
|--------|-------------|
| `recordQuery(status?)` | Increment query counter with success/error status |
| `recordQueryDuration(ms)` | Record query latency histogram |
| `recordRetrievalResults(count, source?)` | Record results-per-query histogram |
| `recordRerankerCall(provider, cost?)` | Increment reranker counter + record cost |
| `recordEmbeddings(count, provider, cost?)` | Increment embedding counter + record cost |
| `recordChunks(count, strategy)` | Increment chunks-created counter |
| `recordEvaluationScore(metric, score)` | Record evaluation score histogram |
| `shutdown()` | Flush and shutdown metrics provider |

#### `getMetricsCollector()`

Returns the global `MetricsCollector` singleton.

### Dashboard

| Function | Description |
|----------|-------------|
| `getDashboardMetrics()` | Get current aggregated dashboard snapshot |
| `updateDashboardMetrics(partial)` | Merge updates into the dashboard |
| `resetDashboardMetrics()` | Clear all dashboard data |
| `calculateHealth(metrics)` | Derive system health from error rates, budget, latency |
| `formatForDashboard(metrics)` | Render an ASCII dashboard for terminal display |
| `exportMetrics()` | Export a flat key-value map for external monitoring |

## Integration with the Pipeline

```typescript
import { createLogger, getTracingManager, getMetricsCollector } from '@reaatech/hybrid-rag-observability';

const logger = createLogger({ level: 'debug', prettyPrint: true });
const tracing = getTracingManager();
const metrics = getMetricsCollector();

// Pass logger, tracing, and metrics into your RAG pipeline configuration
const pipeline = new RAGPipeline({
  // ...
  logger,
  tracing,
  metrics,
});
```

## Related Packages

- [@reaatech/hybrid-rag](https://www.npmjs.com/package/@reaatech/hybrid-rag) — Core types and schemas
- [@reaatech/hybrid-rag-pipeline](https://www.npmjs.com/package/@reaatech/hybrid-rag-pipeline) — RAGPipeline orchestrator

## License

[MIT](https://github.com/reaatech/hybrid-rag-qdrant/blob/main/LICENSE)

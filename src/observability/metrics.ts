/**
 * OpenTelemetry metrics for hybrid-rag-qdrant
 */

import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { Counter, Histogram, Meter } from '@opentelemetry/api';

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** OTLP endpoint for metrics export */
  otlpEndpoint?: string;
  /** Export interval in ms */
  exportInterval?: number;
  /** Enable console exporter */
  consoleExport?: boolean;
}

/**
 * RAG metrics collector
 */
export class MetricsCollector {
  private meter: Meter | null = null;
  private provider: MeterProvider | null = null;

  // Counters
  private queriesTotal: Counter | null = null;
  private rerankerCalls: Counter | null = null;
  private embeddingsGenerated: Counter | null = null;
  private chunksCreated: Counter | null = null;

  // Histograms
  private queryDuration: Histogram | null = null;
  private retrievalResults: Histogram | null = null;
  private rerankerCost: Histogram | null = null;
  private embeddingCost: Histogram | null = null;

  private evaluationScore: Histogram | null = null;

  constructor(config: MetricsConfig = {}) {
    this.initialize(config);
  }

  /**
   * Initialize metrics
   */
  private initialize(config: MetricsConfig): void {
    const readers: Array<import('@opentelemetry/sdk-metrics').MetricReader> = [];

    if (config.otlpEndpoint) {
      readers.push(
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: config.otlpEndpoint }),
        }),
      );
    }

    if (config.consoleExport) {
      readers.push(
        new PeriodicExportingMetricReader({
          exporter: new ConsoleMetricExporter(),
        }),
      );
    }

    this.provider = new MeterProvider({ readers });

    this.meter = this.provider.getMeter('hybrid-rag-qdrant', '1.0.0');

    // Initialize counters
    this.queriesTotal = this.meter.createCounter('rag.queries.total', {
      description: 'Total number of queries',
    });

    this.rerankerCalls = this.meter.createCounter('rag.reranker.calls', {
      description: 'Number of reranker API calls',
    });

    this.embeddingsGenerated = this.meter.createCounter('rag.embeddings.generated', {
      description: 'Number of embeddings generated',
    });

    this.chunksCreated = this.meter.createCounter('rag.chunks.created', {
      description: 'Number of chunks created',
    });

    // Initialize histograms
    this.queryDuration = this.meter.createHistogram('rag.queries.duration_ms', {
      description: 'Query latency in milliseconds',
      advice: { explicitBucketBoundaries: [10, 50, 100, 200, 500, 1000, 2000, 5000] },
    });

    this.retrievalResults = this.meter.createHistogram('rag.retrieval.results', {
      description: 'Number of results per query',
      advice: { explicitBucketBoundaries: [1, 5, 10, 20, 50, 100] },
    });

    this.rerankerCost = this.meter.createHistogram('rag.reranker.cost', {
      description: 'Reranker API cost per request',
    });

    this.embeddingCost = this.meter.createHistogram('rag.embeddings.cost', {
      description: 'Embedding generation cost',
    });

    this.evaluationScore = this.meter.createHistogram('rag.evaluation.score', {
      description: 'Evaluation metric score',
    });
  }

  /**
   * Record a completed query
   */
  recordQuery(status: 'success' | 'error' = 'success'): void {
    this.queriesTotal?.add(1, { status });
  }

  /**
   * Record query duration
   */
  recordQueryDuration(ms: number): void {
    this.queryDuration?.record(ms);
  }

  /**
   * Record retrieval results count
   */
  recordRetrievalResults(count: number, source: string = 'hybrid'): void {
    this.retrievalResults?.record(count, { source });
  }

  /**
   * Record reranker call
   */
  recordRerankerCall(provider: string, cost: number = 0): void {
    this.rerankerCalls?.add(1, { provider });
    this.rerankerCost?.record(cost, { provider });
  }

  /**
   * Record embeddings generated
   */
  recordEmbeddings(count: number, provider: string, cost: number = 0): void {
    this.embeddingsGenerated?.add(count, { provider });
    this.embeddingCost?.record(cost, { provider });
  }

  /**
   * Record chunks created
   */
  recordChunks(count: number, strategy: string): void {
    this.chunksCreated?.add(count, { strategy });
  }

  /**
   * Record evaluation score
   */
  recordEvaluationScore(metric: string, score: number): void {
    this.evaluationScore?.record(score, { metric });
  }

  /**
   * Shutdown metrics collector
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
    }
  }
}

/**
 * Global metrics instance
 */
let globalMetrics: MetricsCollector | null = null;

/**
 * Get or create the global metrics collector
 */
export function getMetricsCollector(): MetricsCollector {
  if (!globalMetrics) {
    globalMetrics = new MetricsCollector();
  }
  return globalMetrics;
}

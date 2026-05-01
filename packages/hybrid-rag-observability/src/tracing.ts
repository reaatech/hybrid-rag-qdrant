/**
 * OpenTelemetry tracing for hybrid-rag-qdrant
 */

import { SpanStatusCode, context, trace } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

/**
 * Tracing configuration
 */
export interface TracingConfig {
  /** OTLP endpoint for trace export */
  otlpEndpoint?: string;
  /** Service name */
  serviceName?: string;
  /** Enable console exporter for debugging */
  consoleExport?: boolean;
  /** Sampling rate (0-1) */
  samplingRate?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TracingConfig = {
  serviceName: 'hybrid-rag-qdrant',
  consoleExport: false,
  samplingRate: 1.0,
};

/**
 * Tracing manager for RAG operations
 */
export class TracingManager {
  private provider: NodeTracerProvider | null = null;
  private tracer: Tracer | null = null;
  private readonly config: TracingConfig;

  constructor(config: TracingConfig = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the tracing provider
   */
  initialize(): void {
    this.provider = new NodeTracerProvider({
      spanLimits: {
        attributeValueLengthLimit: 4096,
      },
    });

    // Add exporters
    if (this.config.otlpEndpoint) {
      const exporter = new OTLPTraceExporter({
        url: this.config.otlpEndpoint,
      });
      this.provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    }

    if (this.config.consoleExport) {
      this.provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    }

    this.provider.register();
    this.tracer = trace.getTracer(this.config.serviceName ?? 'hybrid-rag-qdrant');
  }

  /**
   * Get the tracer instance
   */
  getTracer(): Tracer | null {
    return this.tracer;
  }

  /**
   * Start a query span
   */
  startQuerySpan(queryId: string, query: string): Span | null {
    if (!this.tracer) {
      return null;
    }

    return this.tracer.startSpan('rag.query', {
      attributes: {
        'query.id': queryId,
        'query.text': query.substring(0, 500), // Truncate for privacy
        [SemanticAttributes.DB_OPERATION]: 'query',
      },
    });
  }

  /**
   * Start an embedding span
   */
  startEmbeddingSpan(provider: string, model: string, tokenCount: number): Span | null {
    if (!this.tracer) {
      return null;
    }

    return this.tracer.startSpan('rag.embedding', {
      attributes: {
        'embedding.provider': provider,
        'embedding.model': model,
        'embedding.tokens': tokenCount,
      },
    });
  }

  /**
   * Start a vector search span
   */
  startVectorSearchSpan(k: number, filter?: Record<string, unknown>): Span | null {
    if (!this.tracer) {
      return null;
    }

    return this.tracer.startSpan('rag.vector_search', {
      attributes: {
        'search.k': k,
        'search.filter': filter ? JSON.stringify(filter) : undefined,
      },
    });
  }

  /**
   * Start a BM25 search span
   */
  startBM25SearchSpan(k: number, terms: string[]): Span | null {
    if (!this.tracer) {
      return null;
    }

    return this.tracer.startSpan('rag.bm25_search', {
      attributes: {
        'search.k': k,
        'search.terms': terms.slice(0, 10).join(','),
        'search.term_count': terms.length,
      },
    });
  }

  /**
   * Start a fusion span
   */
  startFusionSpan(strategy: string, candidateCount: number): Span | null {
    if (!this.tracer) {
      return null;
    }

    return this.tracer.startSpan('rag.fusion', {
      attributes: {
        'fusion.strategy': strategy,
        'fusion.candidates': candidateCount,
      },
    });
  }

  /**
   * Start a rerank span
   */
  startRerankSpan(provider: string, documentCount: number): Span | null {
    if (!this.tracer) {
      return null;
    }

    return this.tracer.startSpan('rag.rerank', {
      attributes: {
        'rerank.provider': provider,
        'rerank.documents': documentCount,
      },
    });
  }

  /**
   * Shutdown the tracing provider
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
    }
  }
}

/**
 * Execute a function within a span context
 */
export async function withSpan<T>(span: Span, fn: () => Promise<T>): Promise<T> {
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Global tracing instance
 */
let globalTracing: TracingManager | null = null;

/**
 * Get or create the global tracing manager
 */
export function getTracingManager(): TracingManager {
  if (!globalTracing) {
    globalTracing = new TracingManager();
    globalTracing.initialize();
  }
  return globalTracing;
}

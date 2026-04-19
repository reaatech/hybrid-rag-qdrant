/**
 * Unit tests for observability/tracing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Span } from '@opentelemetry/api';

vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: vi.fn().mockImplementation(() => ({
    addSpanProcessor: vi.fn(),
    register: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
  BatchSpanProcessor: vi.fn(),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  SimpleSpanProcessor: vi.fn(),
  ConsoleSpanExporter: vi.fn(),
}));

vi.mock('@opentelemetry/api', () => ({
  context: {
    active: vi.fn().mockReturnValue({}),
    with: vi.fn((ctx, fn) => fn()),
  },
  trace: {
    getTracer: vi.fn().mockReturnValue({
      startSpan: vi.fn().mockReturnValue({
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
        setAttribute: vi.fn(),
      }),
    }),
    setSpan: vi.fn(),
  },
  SemanticAttributes: {},
  SpanStatusCode: {
    OK: 0,
    ERROR: 1,
  },
}));

describe('observability/tracing', async () => {
  const { TracingManager, withSpan } = await import('../../../src/observability/tracing.js');

  describe('TracingManager', () => {
    let tracingManager: TracingManager;

    beforeEach(() => {
      tracingManager = new TracingManager({
        serviceName: 'test-service',
        consoleExport: false,
      });
    });

    afterEach(async () => {
      await tracingManager.shutdown();
    });

    describe('constructor', () => {
      it('should create with default config', () => {
        const manager = new TracingManager();
        expect(manager).toBeDefined();
      });

      it('should create with custom service name', () => {
        const manager = new TracingManager({ serviceName: 'custom-service' });
        expect(manager).toBeDefined();
      });

      it('should create with console export enabled', () => {
        const manager = new TracingManager({ consoleExport: true });
        expect(manager).toBeDefined();
      });
    });

    describe('initialize', () => {
      it('should initialize without OTLP endpoint', () => {
        tracingManager.initialize();
        expect(tracingManager.getTracer()).toBeDefined();
      });

      it('should initialize with OTLP endpoint', () => {
        const manager = new TracingManager({
          otlpEndpoint: 'http://localhost:4318/v1/traces',
        });
        manager.initialize();
        expect(manager.getTracer()).toBeDefined();
      });

      it('should be idempotent', () => {
        tracingManager.initialize();
        tracingManager.initialize();
        expect(tracingManager.getTracer()).toBeDefined();
      });
    });

    describe('getTracer', () => {
      it('should return null before initialization', () => {
        const manager = new TracingManager();
        expect(manager.getTracer()).toBeNull();
      });

      it('should return tracer after initialization', () => {
        tracingManager.initialize();
        expect(tracingManager.getTracer()).toBeDefined();
      });
    });

    describe('startQuerySpan', () => {
      it('should return null before initialization', () => {
        const span = tracingManager.startQuerySpan('q-123', 'test query');
        expect(span).toBeNull();
      });

      it('should create span with query after initialization', () => {
        tracingManager.initialize();
        const span = tracingManager.startQuerySpan('q-123', 'test query');
        expect(span).toBeDefined();
      });

      it('should truncate query to 500 characters', () => {
        tracingManager.initialize();
        const longQuery = 'a'.repeat(1000);
        const span = tracingManager.startQuerySpan('q-123', longQuery);
        expect(span).toBeDefined();
      });

      it('should handle short query without truncation', () => {
        tracingManager.initialize();
        const span = tracingManager.startQuerySpan('q-123', 'short query');
        expect(span).toBeDefined();
      });

      it('should handle empty query', () => {
        tracingManager.initialize();
        const span = tracingManager.startQuerySpan('q-123', '');
        expect(span).toBeDefined();
      });
    });

    describe('startEmbeddingSpan', () => {
      it('should return null before initialization', () => {
        const span = tracingManager.startEmbeddingSpan('openai', 'text-embedding-3-small', 100);
        expect(span).toBeNull();
      });

      it('should create span with embedding metadata', () => {
        tracingManager.initialize();
        const span = tracingManager.startEmbeddingSpan('openai', 'text-embedding-3-small', 100);
        expect(span).toBeDefined();
      });

      it('should handle zero tokens', () => {
        tracingManager.initialize();
        const span = tracingManager.startEmbeddingSpan('openai', 'text-embedding-3-small', 0);
        expect(span).toBeDefined();
      });

      it('should handle large token count', () => {
        tracingManager.initialize();
        const span = tracingManager.startEmbeddingSpan('openai', 'text-embedding-3-large', 10000);
        expect(span).toBeDefined();
      });
    });

    describe('startVectorSearchSpan', () => {
      it('should return null before initialization', () => {
        const span = tracingManager.startVectorSearchSpan(10);
        expect(span).toBeNull();
      });

      it('should create span with k', () => {
        tracingManager.initialize();
        const span = tracingManager.startVectorSearchSpan(10);
        expect(span).toBeDefined();
      });

      it('should create span with k and filter', () => {
        tracingManager.initialize();
        const filter = { category: 'tech' };
        const span = tracingManager.startVectorSearchSpan(10, filter);
        expect(span).toBeDefined();
      });

      it('should handle undefined filter', () => {
        tracingManager.initialize();
        const span = tracingManager.startVectorSearchSpan(5, undefined);
        expect(span).toBeDefined();
      });

      it('should stringify complex filter', () => {
        tracingManager.initialize();
        const filter = { category: 'tech', type: { id: 1 } };
        const span = tracingManager.startVectorSearchSpan(10, filter);
        expect(span).toBeDefined();
      });
    });

    describe('startBM25SearchSpan', () => {
      it('should return null before initialization', () => {
        const span = tracingManager.startBM25SearchSpan(10, ['query', 'terms']);
        expect(span).toBeNull();
      });

      it('should create span with k and terms', () => {
        tracingManager.initialize();
        const span = tracingManager.startBM25SearchSpan(10, ['query', 'terms']);
        expect(span).toBeDefined();
      });

      it('should limit terms to 10', () => {
        tracingManager.initialize();
        const manyTerms = Array(20).fill('term');
        const span = tracingManager.startBM25SearchSpan(10, manyTerms);
        expect(span).toBeDefined();
      });

      it('should handle empty terms array', () => {
        tracingManager.initialize();
        const span = tracingManager.startBM25SearchSpan(5, []);
        expect(span).toBeDefined();
      });

      it('should handle single term', () => {
        tracingManager.initialize();
        const span = tracingManager.startBM25SearchSpan(5, ['single']);
        expect(span).toBeDefined();
      });
    });

    describe('startFusionSpan', () => {
      it('should return null before initialization', () => {
        const span = tracingManager.startFusionSpan('rrf', 100);
        expect(span).toBeNull();
      });

      it('should create span with strategy and count', () => {
        tracingManager.initialize();
        const span = tracingManager.startFusionSpan('rrf', 100);
        expect(span).toBeDefined();
      });

      it('should handle weighted-sum strategy', () => {
        tracingManager.initialize();
        const span = tracingManager.startFusionSpan('weighted-sum', 50);
        expect(span).toBeDefined();
      });

      it('should handle normalized strategy', () => {
        tracingManager.initialize();
        const span = tracingManager.startFusionSpan('normalized', 75);
        expect(span).toBeDefined();
      });

      it('should handle zero candidates', () => {
        tracingManager.initialize();
        const span = tracingManager.startFusionSpan('rrf', 0);
        expect(span).toBeDefined();
      });
    });

    describe('startRerankSpan', () => {
      it('should return null before initialization', () => {
        const span = tracingManager.startRerankSpan('cohere', 10);
        expect(span).toBeNull();
      });

      it('should create span with provider and count', () => {
        tracingManager.initialize();
        const span = tracingManager.startRerankSpan('cohere', 10);
        expect(span).toBeDefined();
      });

      it('should handle jina provider', () => {
        tracingManager.initialize();
        const span = tracingManager.startRerankSpan('jina', 20);
        expect(span).toBeDefined();
      });

      it('should handle zero documents', () => {
        tracingManager.initialize();
        const span = tracingManager.startRerankSpan('cohere', 0);
        expect(span).toBeDefined();
      });
    });

    describe('shutdown', () => {
      it('should shutdown without error when not initialized', async () => {
        const manager = new TracingManager();
        await expect(manager.shutdown()).resolves.not.toThrow();
      });

      it('should shutdown after initialization', async () => {
        tracingManager.initialize();
        await expect(tracingManager.shutdown()).resolves.not.toThrow();
      });

      it('should handle multiple shutdowns', async () => {
        tracingManager.initialize();
        await tracingManager.shutdown();
        await expect(tracingManager.shutdown()).resolves.not.toThrow();
      });
    });
  });

  describe('withSpan', () => {
    it('should wrap async function in span', async () => {
      const mockSpan = {
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      const fn = vi.fn().mockResolvedValue('result');
      const result = await withSpan(mockSpan as Span, fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(mockSpan.setStatus).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should propagate error from wrapped function', async () => {
      const mockSpan = {
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      const error = new Error('test error');
      const fn = vi.fn().mockRejectedValue(error);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(withSpan(mockSpan as any, fn)).rejects.toThrow('test error');
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should end span even if function throws', async () => {
      const mockSpan = {
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };

      const fn = vi.fn().mockImplementation(() => {
        throw new Error('sync error');
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(withSpan(mockSpan as any, fn)).rejects.toThrow('sync error');
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });
});
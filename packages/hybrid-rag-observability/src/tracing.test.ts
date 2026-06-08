import type { Span } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(function OTLPTraceExporter(this: Record<string, unknown>) {
    this.export = vi.fn();
    this.shutdown = vi.fn().mockResolvedValue(undefined);
  }),
}));

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getTracingManager, TracingManager, withSpan } from './tracing.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('TracingManager span helpers before initialize', () => {
  it('returns null spans when the tracer is not initialized', () => {
    const tm = new TracingManager();
    expect(tm.getTracer()).toBeNull();
    expect(tm.startQuerySpan('q', 'text')).toBeNull();
    expect(tm.startEmbeddingSpan('openai', 'm', 5)).toBeNull();
    expect(tm.startVectorSearchSpan(10)).toBeNull();
    expect(tm.startBM25SearchSpan(10, ['a'])).toBeNull();
    expect(tm.startFusionSpan('rrf', 3)).toBeNull();
    expect(tm.startRerankSpan('cohere', 4)).toBeNull();
  });

  it('shutdown is a no-op when not initialized', async () => {
    const tm = new TracingManager();
    await expect(tm.shutdown()).resolves.toBeUndefined();
  });
});

describe('TracingManager after initialize', () => {
  it('initializes with no exporters and produces spans', () => {
    const tm = new TracingManager();
    tm.initialize();
    expect(tm.getTracer()).not.toBeNull();
    expect(tm.startQuerySpan('q', 'x'.repeat(600))).not.toBeNull();
    expect(tm.startEmbeddingSpan('openai', 'model', 12)).not.toBeNull();
    expect(tm.startVectorSearchSpan(5, { tag: { $eq: 'a' } })).not.toBeNull();
    expect(tm.startVectorSearchSpan(5)).not.toBeNull();
    expect(tm.startBM25SearchSpan(5, ['x', 'y'])).not.toBeNull();
    expect(tm.startFusionSpan('rrf', 8)).not.toBeNull();
    expect(tm.startRerankSpan('cohere', 4)).not.toBeNull();
  });

  it('initializes with an OTLP endpoint and console exporter', async () => {
    const tm = new TracingManager({
      otlpEndpoint: 'http://localhost:4318/v1/traces',
      consoleExport: true,
    });
    tm.initialize();
    expect(OTLPTraceExporter).toHaveBeenCalledWith({ url: 'http://localhost:4318/v1/traces' });
    await expect(tm.shutdown()).resolves.toBeUndefined();
  });
});

function fakeSpan(): Span & {
  setStatus: ReturnType<typeof vi.fn>;
  recordException: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  return {
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  } as unknown as Span & {
    setStatus: ReturnType<typeof vi.fn>;
    recordException: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

describe('withSpan', () => {
  it('sets OK status and ends the span on success', async () => {
    const span = fakeSpan();
    const result = await withSpan(span, async () => 'value');
    expect(result).toBe('value');
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(span.end).toHaveBeenCalled();
  });

  it('records exceptions and rethrows on failure', async () => {
    const span = fakeSpan();
    await expect(
      withSpan(span, async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(span.recordException).toHaveBeenCalled();
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'failed',
    });
    expect(span.end).toHaveBeenCalled();
  });
});

describe('getTracingManager', () => {
  it('returns an initialized singleton', () => {
    const a = getTracingManager();
    const b = getTracingManager();
    expect(a).toBe(b);
    expect(a.getTracer()).not.toBeNull();
  });
});

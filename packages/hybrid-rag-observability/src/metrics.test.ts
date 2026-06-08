import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: vi.fn(function OTLPMetricExporter(this: Record<string, unknown>) {
    this.export = vi.fn();
    this.shutdown = vi.fn().mockResolvedValue(undefined);
    this.forceFlush = vi.fn().mockResolvedValue(undefined);
  }),
}));

import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { getMetricsCollector, MetricsCollector } from './metrics.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('MetricsCollector', () => {
  it('initializes without readers when no config supplied', () => {
    const mc = new MetricsCollector();
    expect(mc).toBeInstanceOf(MetricsCollector);
  });

  it('creates an OTLP reader when an endpoint is given', () => {
    new MetricsCollector({ otlpEndpoint: 'http://localhost:4318/v1/metrics' });
    expect(OTLPMetricExporter).toHaveBeenCalledWith({
      url: 'http://localhost:4318/v1/metrics',
    });
  });

  it('creates a console reader when consoleExport is enabled', () => {
    const mc = new MetricsCollector({ consoleExport: true });
    expect(mc).toBeInstanceOf(MetricsCollector);
  });

  it('records all metric types without throwing', () => {
    const mc = new MetricsCollector();
    expect(() => {
      mc.recordQuery();
      mc.recordQuery('error');
      mc.recordQueryDuration(123);
      mc.recordRetrievalResults(10);
      mc.recordRetrievalResults(5, 'vector');
      mc.recordRerankerCall('cohere', 0.002);
      mc.recordEmbeddings(8, 'openai', 0.001);
      mc.recordChunks(20, 'fixed-size');
      mc.recordEvaluationScore('precision', 0.9);
    }).not.toThrow();
  });

  it('shuts down cleanly', async () => {
    const mc = new MetricsCollector();
    await expect(mc.shutdown()).resolves.toBeUndefined();
  });
});

describe('getMetricsCollector', () => {
  it('returns a singleton', () => {
    const a = getMetricsCollector();
    const b = getMetricsCollector();
    expect(a).toBe(b);
  });
});

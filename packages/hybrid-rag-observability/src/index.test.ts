import { describe, expect, it, vi } from 'vitest';

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: vi.fn(function OTLPMetricExporter(this: Record<string, unknown>) {
    this.export = vi.fn();
    this.shutdown = vi.fn().mockResolvedValue(undefined);
    this.forceFlush = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(function OTLPTraceExporter(this: Record<string, unknown>) {
    this.export = vi.fn();
    this.shutdown = vi.fn().mockResolvedValue(undefined);
  }),
}));

import * as api from './index.js';

describe('package exports', () => {
  it('exposes the public API surface', () => {
    expect(typeof api.createLogger).toBe('function');
    expect(typeof api.createQueryLogger).toBe('function');
    expect(typeof api.getLogger).toBe('function');
    expect(typeof api.logQueryStart).toBe('function');
    expect(typeof api.logQueryComplete).toBe('function');
    expect(typeof api.logQueryError).toBe('function');
    expect(typeof api.logIngestionStart).toBe('function');
    expect(typeof api.logIngestionComplete).toBe('function');
    expect(typeof api.logEvaluationResults).toBe('function');
    expect(typeof api.MetricsCollector).toBe('function');
    expect(typeof api.getMetricsCollector).toBe('function');
    expect(typeof api.TracingManager).toBe('function');
    expect(typeof api.getTracingManager).toBe('function');
    expect(typeof api.withSpan).toBe('function');
    expect(typeof api.getDashboardMetrics).toBe('function');
    expect(typeof api.updateDashboardMetrics).toBe('function');
    expect(typeof api.resetDashboardMetrics).toBe('function');
    expect(typeof api.calculateHealth).toBe('function');
    expect(typeof api.formatForDashboard).toBe('function');
    expect(typeof api.exportMetrics).toBe('function');
  });
});

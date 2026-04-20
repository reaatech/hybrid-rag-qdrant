/**
 * Unit tests for observability/metrics
 *
 * Note: These tests verify the MetricsCollector class behavior without
 * requiring full OpenTelemetry infrastructure setup.
 */

import { describe, it, expect } from 'vitest';

describe('observability/metrics', async () => {
  const { MetricsCollector, getMetricsCollector } =
    await import('../../../src/observability/metrics.js');

  describe('MetricsCollector', () => {
    it('should be defined as a class', () => {
      expect(MetricsCollector).toBeDefined();
      expect(typeof MetricsCollector).toBe('function');
    });

    it('should have all required methods', () => {
      const collector = new MetricsCollector({});

      expect(typeof collector.recordQuery).toBe('function');
      expect(typeof collector.recordQueryDuration).toBe('function');
      expect(typeof collector.recordRetrievalResults).toBe('function');
      expect(typeof collector.recordRerankerCall).toBe('function');
      expect(typeof collector.recordEmbeddings).toBe('function');
      expect(typeof collector.recordChunks).toBe('function');
      expect(typeof collector.recordEvaluationScore).toBe('function');
      expect(typeof collector.shutdown).toBe('function');
    });

    it('should create instance without config', () => {
      expect(() => new MetricsCollector({})).not.toThrow();
    });

    it('should create instance with config', () => {
      expect(
        () =>
          new MetricsCollector({
            otlpEndpoint: 'http://localhost:4318',
            exportInterval: 30000,
            consoleExport: false,
          }),
      ).not.toThrow();
    });

    it('should accept optional otlpEndpoint', () => {
      expect(() => new MetricsCollector({ otlpEndpoint: 'http://localhost:4318' })).not.toThrow();
    });

    it('should accept optional exportInterval', () => {
      expect(() => new MetricsCollector({ exportInterval: 60000 })).not.toThrow();
    });

    it('should accept optional consoleExport', () => {
      expect(() => new MetricsCollector({ consoleExport: true })).not.toThrow();
    });
  });

  describe('getMetricsCollector', () => {
    it('should be defined as a function', () => {
      expect(typeof getMetricsCollector).toBe('function');
    });

    it('should return singleton instance', () => {
      const instance1 = getMetricsCollector();
      const instance2 = getMetricsCollector();
      expect(instance1).toBe(instance2);
    });
  });
});

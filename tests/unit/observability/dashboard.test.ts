/**
 * Unit tests for observability/dashboard
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/observability/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('observability/dashboard', async () => {
  const {
    getDashboardMetrics,
    updateDashboardMetrics,
    resetDashboardMetrics,
    calculateHealth,
    formatForDashboard,
    exportMetrics,
  } = await import('../../../src/observability/dashboard.js');

  beforeEach(() => {
    resetDashboardMetrics();
  });

  afterEach(() => {
    resetDashboardMetrics();
  });

  describe('getDashboardMetrics', () => {
    it('should return metrics with default values', () => {
      const metrics = getDashboardMetrics();

      expect(metrics.system).toBeDefined();
      expect(metrics.system.health).toBe('healthy');
      expect(metrics.system.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.system.version).toBe('1.0.0');

      expect(metrics.performance).toBeDefined();
      expect(metrics.performance.avgLatency).toBe(0);
      expect(metrics.performance.p50Latency).toBe(0);
      expect(metrics.performance.p90Latency).toBe(0);
      expect(metrics.performance.p99Latency).toBe(0);
      expect(metrics.performance.throughput).toBe(0);
      expect(metrics.performance.errorRate).toBe(0);

      expect(metrics.retrieval).toBeDefined();
      expect(metrics.quality).toBeDefined();
      expect(metrics.cost).toBeDefined();
      expect(metrics.usage).toBeDefined();
    });

    it('should return different uptime on subsequent calls', async () => {
      const metrics1 = getDashboardMetrics();
      await new Promise(resolve => setTimeout(resolve, 10));
      const metrics2 = getDashboardMetrics();

      expect(metrics2.system.uptime).toBeGreaterThan(metrics1.system.uptime);
    });

    it('should include timestamp', () => {
      const metrics = getDashboardMetrics();
      expect(metrics.timestamp).toBeDefined();
      expect(typeof metrics.timestamp).toBe('string');
    });
  });

  describe('updateDashboardMetrics', () => {
    it('should update performance metrics', () => {
      updateDashboardMetrics({
        performance: {
          avgLatency: 100,
          p50Latency: 80,
          p90Latency: 200,
          p99Latency: 500,
          throughput: 10.5,
          errorRate: 0.01,
        },
      });

      const metrics = getDashboardMetrics();
      expect(metrics.performance.avgLatency).toBe(100);
      expect(metrics.performance.p50Latency).toBe(80);
      expect(metrics.performance.p90Latency).toBe(200);
      expect(metrics.performance.p99Latency).toBe(500);
      expect(metrics.performance.throughput).toBe(10.5);
      expect(metrics.performance.errorRate).toBe(0.01);
    });

    it('should update cost metrics', () => {
      updateDashboardMetrics({
        cost: {
          totalCostToday: 25.50,
          avgCostPerQuery: 0.05,
          budgetRemaining: 75,
          budgetStatus: 'under',
        },
      });

      const metrics = getDashboardMetrics();
      expect(metrics.cost.totalCostToday).toBe(25.50);
      expect(metrics.cost.avgCostPerQuery).toBe(0.05);
      expect(metrics.cost.budgetRemaining).toBe(75);
      expect(metrics.cost.budgetStatus).toBe('under');
    });

    it('should update usage metrics', () => {
      updateDashboardMetrics({
        usage: {
          totalQueriesToday: 500,
          totalDocuments: 100,
          activeSessions: 10,
          qps: 5.5,
        },
      });

      const metrics = getDashboardMetrics();
      expect(metrics.usage.totalQueriesToday).toBe(500);
      expect(metrics.usage.totalDocuments).toBe(100);
      expect(metrics.usage.activeSessions).toBe(10);
      expect(metrics.usage.qps).toBe(5.5);
    });

    it('should partially update nested objects', () => {
      updateDashboardMetrics({
        performance: {
          avgLatency: 100,
        },
      });

      const metrics = getDashboardMetrics();
      expect(metrics.performance.avgLatency).toBe(100);
    });
  });

  describe('resetDashboardMetrics', () => {
    it('should reset metrics to defaults', () => {
      updateDashboardMetrics({
        performance: {
          avgLatency: 100,
          errorRate: 0.5,
        },
        cost: {
          totalCostToday: 100,
        },
      });

      resetDashboardMetrics();

      const metrics = getDashboardMetrics();
      expect(metrics.performance.avgLatency).toBe(0);
      expect(metrics.performance.errorRate).toBe(0);
      expect(metrics.cost.totalCostToday).toBe(0);
    });
  });

  describe('calculateHealth', () => {
    it('should return healthy when all metrics are good', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('healthy');
    });

    it('should return degraded when error rate > 5%', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.06,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('degraded');
    });

    it('should return unhealthy when error rate > 10%', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.15,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('unhealthy');
    });

    it('should return unhealthy when budget exceeded', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'exceeded' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('unhealthy');
    });

    it('should return degraded when budget warning', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'warning' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('degraded');
    });

    it('should return degraded when p99 latency > 5000ms', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 6000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('degraded');
    });

    it('should return healthy when p99 latency exactly 5000ms', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 5000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('healthy');
    });

    it('should prioritize error rate over latency', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.15,
          p99Latency: 6000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('unhealthy');
    });
  });

  describe('formatForDashboard', () => {
    it('should return ASCII dashboard string', () => {
      const metrics = getDashboardMetrics();
      const output = formatForDashboard(metrics);

      expect(typeof output).toBe('string');
      expect(output).toContain('Hybrid RAG Qdrant');
      expect(output).toContain('Status:');
      expect(output).toContain('Uptime:');
      expect(output).toContain('Performance');
    });

    it('should show healthy status with green indicator', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const output = formatForDashboard(metrics);
      expect(output).toContain('🟢');
      expect(output).toContain('healthy');
    });

    it('should show degraded status with yellow indicator', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.06,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const output = formatForDashboard(metrics);
      expect(output).toContain('🟡');
      expect(output).toContain('degraded');
    });

    it('should show unhealthy status with red indicator', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.15,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const output = formatForDashboard(metrics);
      expect(output).toContain('🔴');
      expect(output).toContain('unhealthy');
    });

    it('should display performance metrics', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          avgLatency: 150,
          p50Latency: 100,
          p90Latency: 300,
          p99Latency: 500,
          errorRate: 0.01,
          throughput: 10,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const output = formatForDashboard(metrics);
      expect(output).toContain('150');
      expect(output).toContain('100');
    });

    it('should display cost metrics', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 1000,
        },
        cost: {
          totalCostToday: 25.50,
          avgCostPerQuery: 0.05,
          budgetRemaining: 75,
          budgetStatus: 'under' as const,
        },
      };

      const output = formatForDashboard(metrics);
      expect(output).toContain('25.5');
      expect(output).toContain('75');
    });

    it('should display usage metrics', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
        usage: {
          totalQueriesToday: 1000,
          totalDocuments: 500,
          activeSessions: 10,
          qps: 5,
        },
      };

      const output = formatForDashboard(metrics);
      expect(output).toContain('1000');
      expect(output).toContain('500');
    });
  });

  describe('exportMetrics', () => {
    it('should return flat key-value object', () => {
      const exported = exportMetrics();

      expect(typeof exported).toBe('object');
      expect(exported).toHaveProperty('system.health');
      expect(exported).toHaveProperty('system.uptime');
      expect(exported).toHaveProperty('performance.avg_latency_ms');
      expect(exported).toHaveProperty('performance.error_rate');
      expect(exported).toHaveProperty('cost.total_today');
      expect(exported).toHaveProperty('usage.queries_today');
    });

    it('should map healthy status to 1', () => {
      const metrics = {
        ...getDashboardMetrics(),
        performance: {
          ...getDashboardMetrics().performance,
          errorRate: 0.01,
          p99Latency: 1000,
        },
        cost: {
          ...getDashboardMetrics().cost,
          budgetStatus: 'under' as const,
        },
      };

      const health = calculateHealth(metrics);
      expect(health).toBe('healthy');

      const exported = exportMetrics();
      expect(exported['system.health']).toBe(1);
    });

    it('should include all performance metrics', () => {
      const exported = exportMetrics();

      expect(exported).toHaveProperty('performance.p50_latency_ms');
      expect(exported).toHaveProperty('performance.p90_latency_ms');
      expect(exported).toHaveProperty('performance.p99_latency_ms');
      expect(exported).toHaveProperty('performance.throughput_qps');
    });

    it('should include quality metrics', () => {
      const exported = exportMetrics();

      expect(exported).toHaveProperty('quality.relevance_score');
      expect(exported).toHaveProperty('quality.faithfulness_score');
      expect(exported).toHaveProperty('quality.hallucination_rate');
    });

    it('should reflect updated values', () => {
      updateDashboardMetrics({
        performance: {
          avgLatency: 200,
          errorRate: 0.02,
        },
        usage: {
          totalQueriesToday: 500,
        },
      });

      const exported = exportMetrics();

      expect(exported['performance.avg_latency_ms']).toBe(200);
      expect(exported['usage.queries_today']).toBe(500);
    });
  });
});
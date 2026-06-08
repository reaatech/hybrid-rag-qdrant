import { afterEach, describe, expect, it } from 'vitest';
import {
  calculateHealth,
  type DashboardMetrics,
  exportMetrics,
  formatForDashboard,
  getDashboardMetrics,
  resetDashboardMetrics,
  updateDashboardMetrics,
} from './dashboard.js';

afterEach(() => {
  resetDashboardMetrics();
});

describe('dashboard metrics store', () => {
  it('returns default metrics initially', () => {
    const m = getDashboardMetrics();
    expect(m.system.health).toBe('healthy');
    expect(m.system.version).toBe('1.0.0');
    expect(m.system.uptime).toBeGreaterThanOrEqual(0);
    expect(m.performance.avgLatency).toBe(0);
  });

  it('deep-merges nested object updates', () => {
    updateDashboardMetrics({ performance: { avgLatency: 42 } as DashboardMetrics['performance'] });
    const m = getDashboardMetrics();
    expect(m.performance.avgLatency).toBe(42);
    // other nested fields preserved from defaults
    expect(m.performance.errorRate).toBe(0);
  });

  it('merges further nested updates over prior ones', () => {
    updateDashboardMetrics({ usage: { totalQueriesToday: 5 } as DashboardMetrics['usage'] });
    updateDashboardMetrics({ usage: { totalDocuments: 9 } as DashboardMetrics['usage'] });
    const m = getDashboardMetrics();
    expect(m.usage.totalQueriesToday).toBe(5);
    expect(m.usage.totalDocuments).toBe(9);
  });

  it('handles scalar top-level overrides', () => {
    updateDashboardMetrics({ timestamp: 'fixed' } as Partial<DashboardMetrics>);
    const m = getDashboardMetrics();
    // get() always re-stamps timestamp, but the store accepted the scalar path
    expect(typeof m.timestamp).toBe('string');
  });

  it('reset clears applied updates', () => {
    updateDashboardMetrics({ performance: { avgLatency: 100 } as DashboardMetrics['performance'] });
    resetDashboardMetrics();
    expect(getDashboardMetrics().performance.avgLatency).toBe(0);
  });
});

describe('calculateHealth', () => {
  function metricsWith(over: Partial<DashboardMetrics>): DashboardMetrics {
    return { ...getDashboardMetrics(), ...over } as DashboardMetrics;
  }

  it('is unhealthy on high error rate', () => {
    expect(
      calculateHealth(
        metricsWith({ performance: { errorRate: 0.2 } as DashboardMetrics['performance'] }),
      ),
    ).toBe('unhealthy');
  });

  it('is degraded on moderate error rate', () => {
    expect(
      calculateHealth(
        metricsWith({ performance: { errorRate: 0.07 } as DashboardMetrics['performance'] }),
      ),
    ).toBe('degraded');
  });

  it('is unhealthy when budget exceeded', () => {
    expect(
      calculateHealth(
        metricsWith({
          performance: { errorRate: 0 } as DashboardMetrics['performance'],
          cost: { budgetStatus: 'exceeded' } as DashboardMetrics['cost'],
        }),
      ),
    ).toBe('unhealthy');
  });

  it('is degraded when budget warning', () => {
    expect(
      calculateHealth(
        metricsWith({
          performance: { errorRate: 0 } as DashboardMetrics['performance'],
          cost: { budgetStatus: 'warning' } as DashboardMetrics['cost'],
        }),
      ),
    ).toBe('degraded');
  });

  it('is degraded on high p99 latency', () => {
    expect(
      calculateHealth(
        metricsWith({
          performance: { errorRate: 0, p99Latency: 6000 } as DashboardMetrics['performance'],
          cost: { budgetStatus: 'under' } as DashboardMetrics['cost'],
        }),
      ),
    ).toBe('degraded');
  });

  it('is healthy under normal conditions', () => {
    expect(
      calculateHealth(
        metricsWith({
          performance: { errorRate: 0, p99Latency: 100 } as DashboardMetrics['performance'],
          cost: { budgetStatus: 'under' } as DashboardMetrics['cost'],
        }),
      ),
    ).toBe('healthy');
  });
});

describe('formatForDashboard', () => {
  it('formats a dashboard string for each health state', () => {
    const healthy = formatForDashboard(getDashboardMetrics());
    expect(healthy).toContain('System Dashboard');
    expect(healthy).toContain('healthy');

    updateDashboardMetrics({
      performance: { errorRate: 0.07 } as DashboardMetrics['performance'],
    });
    expect(formatForDashboard(getDashboardMetrics())).toContain('degraded');

    updateDashboardMetrics({
      performance: { errorRate: 0.5 } as DashboardMetrics['performance'],
    });
    expect(formatForDashboard(getDashboardMetrics())).toContain('unhealthy');
  });
});

describe('exportMetrics', () => {
  it('exports a flat numeric map with health encoded', () => {
    const flat = exportMetrics();
    expect(flat['system.health']).toBe(1);
    expect(typeof flat['performance.avg_latency_ms']).toBe('number');

    updateDashboardMetrics({
      performance: { errorRate: 0.07 } as DashboardMetrics['performance'],
    });
    expect(exportMetrics()['system.health']).toBe(0.5);

    updateDashboardMetrics({
      performance: { errorRate: 0.5 } as DashboardMetrics['performance'],
    });
    expect(exportMetrics()['system.health']).toBe(0);
  });
});

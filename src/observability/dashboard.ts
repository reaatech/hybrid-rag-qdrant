/**
 * Dashboard metrics aggregation for real-time monitoring
 */

import { getLogger } from './logger.js';

const logger = getLogger();

/**
 * Dashboard metrics data structure
 */
export interface DashboardMetrics {
  timestamp: string;
  system: {
    health: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    version: string;
  };
  performance: {
    avgLatency: number;
    p50Latency: number;
    p90Latency: number;
    p99Latency: number;
    throughput: number;
    errorRate: number;
  };
  retrieval: {
    vectorSearchLatency: number;
    bm25SearchLatency: number;
    rerankerLatency: number;
    hybridFusionLatency: number;
    cacheHitRate: number;
  };
  quality: {
    avgRelevanceScore: number;
    avgFaithfulnessScore: number;
    hallucinationRate: number;
  };
  cost: {
    totalCostToday: number;
    avgCostPerQuery: number;
    budgetRemaining: number;
    budgetStatus: 'under' | 'warning' | 'exceeded';
  };
  usage: {
    totalQueriesToday: number;
    totalDocuments: number;
    activeSessions: number;
    qps: number;
  };
}

/**
 * Default empty metrics
 */
const emptyMetrics: DashboardMetrics = {
  timestamp: new Date().toISOString(),
  system: {
    health: 'healthy',
    uptime: 0,
    version: '1.0.0',
  },
  performance: {
    avgLatency: 0,
    p50Latency: 0,
    p90Latency: 0,
    p99Latency: 0,
    throughput: 0,
    errorRate: 0,
  },
  retrieval: {
    vectorSearchLatency: 0,
    bm25SearchLatency: 0,
    rerankerLatency: 0,
    hybridFusionLatency: 0,
    cacheHitRate: 0,
  },
  quality: {
    avgRelevanceScore: 0,
    avgFaithfulnessScore: 0,
    hallucinationRate: 0,
  },
  cost: {
    totalCostToday: 0,
    avgCostPerQuery: 0,
    budgetRemaining: 100,
    budgetStatus: 'under',
  },
  usage: {
    totalQueriesToday: 0,
    totalDocuments: 0,
    activeSessions: 0,
    qps: 0,
  },
};

/**
 * In-memory metrics store (would be replaced by actual metrics collection)
 */
class MetricsStore {
  private metrics: Partial<DashboardMetrics> = {};
  private startTime: number = Date.now();

  update(data: Partial<DashboardMetrics>): void {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && key in this.metrics && typeof this.metrics[key as keyof DashboardMetrics] === 'object') {
        (this.metrics as Record<string, unknown>)[key] = {
          ...(this.metrics[key as keyof DashboardMetrics] as object),
          ...value,
        };
      } else {
        (this.metrics as Record<string, unknown>)[key] = value;
      }
    }
  }

  get(): DashboardMetrics {
    const uptime = (Date.now() - this.startTime) / 1000;
      const result = { ...emptyMetrics } as DashboardMetrics;
      for (const key of Object.keys(this.metrics) as Array<keyof DashboardMetrics>) {
        const value = this.metrics[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          (result as unknown as Record<string, unknown>)[key] = { ...(emptyMetrics[key] as object), ...value };
        } else if (value !== undefined) {
          (result as unknown as Record<string, unknown>)[key] = value;
        }
      }
    result.timestamp = new Date().toISOString();
    result.system = { ...emptyMetrics.system, ...(this.metrics.system ?? {}), uptime };
    return result;
  }

  reset(): void {
    this.metrics = {};
    this.startTime = Date.now();
  }
}

const metricsStore = new MetricsStore();

/**
 * Get current dashboard metrics
 */
export function getDashboardMetrics(): DashboardMetrics {
  return metricsStore.get();
}

/**
 * Update dashboard metrics
 */
export function updateDashboardMetrics(data: Partial<DashboardMetrics>): void {
  metricsStore.update(data);
  logger.debug({ msg: 'Dashboard metrics updated', timestamp: new Date().toISOString() });
}

/**
 * Reset dashboard metrics
 */
export function resetDashboardMetrics(): void {
  metricsStore.reset();
  logger.info('Dashboard metrics reset');
}

/**
 * Calculate system health based on metrics
 */
export function calculateHealth(metrics: DashboardMetrics): 'healthy' | 'degraded' | 'unhealthy' {
  const { performance, cost } = metrics;

  // Check error rate
  if (performance.errorRate > 0.1) {return 'unhealthy';}
  if (performance.errorRate > 0.05) {return 'degraded';}

  // Check budget
  if (cost.budgetStatus === 'exceeded') {return 'unhealthy';}
  if (cost.budgetStatus === 'warning') {return 'degraded';}

  // Check latency
  if (performance.p99Latency > 5000) {return 'degraded';}

  return 'healthy';
}

/**
 * Format metrics for dashboard display
 */
export function formatForDashboard(metrics: DashboardMetrics): string {
  const health = calculateHealth(metrics);
  const healthEmoji = health === 'healthy' ? '🟢' : health === 'degraded' ? '🟡' : '🔴';

  return `
╔══════════════════════════════════════════╗
║  Hybrid RAG Qdrant - System Dashboard    ║
╠══════════════════════════════════════════╣
║  Status: ${healthEmoji} ${health.padEnd(33)}║
║  Uptime: ${metrics.system.uptime.toFixed(0).padStart(6)}s                        ║
║  Version: ${metrics.system.version.padEnd(31)}║
╠══════════════════════════════════════════╣
║  Performance                             ║
║  ─────────────────────────────────────  ║
║  Avg Latency:    ${metrics.performance.avgLatency.toFixed(0).padStart(6)}ms                       ║
║  P50 Latency:    ${metrics.performance.p50Latency.toFixed(0).padStart(6)}ms                       ║
║  P90 Latency:    ${metrics.performance.p90Latency.toFixed(0).padStart(6)}ms                       ║
║  P99 Latency:    ${metrics.performance.p99Latency.toFixed(0).padStart(6)}ms                       ║
║  Throughput:     ${metrics.performance.throughput.toFixed(1).padStart(6)} qps                     ║
║  Error Rate:     ${(metrics.performance.errorRate * 100).toFixed(1).padStart(6)}%                       ║
╠══════════════════════════════════════════╣
║  Cost                                    ║
║  ─────────────────────────────────────  ║
║  Today's Cost:   $${metrics.cost.totalCostToday.toFixed(4).padStart(10)}                  ║
║  Avg/Query:      $${metrics.cost.avgCostPerQuery.toFixed(6).padStart(10)}                  ║
║  Budget:         ${metrics.cost.budgetRemaining.toFixed(0).padStart(6)}% ${metrics.cost.budgetStatus.padEnd(8)}               ║
╠══════════════════════════════════════════╣
║  Usage                                   ║
║  ─────────────────────────────────────  ║
║  Queries Today:  ${metrics.usage.totalQueriesToday.toString().padStart(6)}                        ║
║  Documents:      ${metrics.usage.totalDocuments.toString().padStart(6)}                        ║
║  Active Sessions:${metrics.usage.activeSessions.toString().padStart(6)}                        ║
╚══════════════════════════════════════════╝
`.trim();
}

/**
 * Export metrics for external monitoring systems
 */
export function exportMetrics(): Record<string, unknown> {
  const metrics = getDashboardMetrics();
  const health = calculateHealth(metrics);

  return {
    'system.health': health === 'healthy' ? 1 : health === 'degraded' ? 0.5 : 0,
    'system.uptime': metrics.system.uptime,
    'performance.avg_latency_ms': metrics.performance.avgLatency,
    'performance.p50_latency_ms': metrics.performance.p50Latency,
    'performance.p90_latency_ms': metrics.performance.p90Latency,
    'performance.p99_latency_ms': metrics.performance.p99Latency,
    'performance.throughput_qps': metrics.performance.throughput,
    'performance.error_rate': metrics.performance.errorRate,
    'cost.total_today': metrics.cost.totalCostToday,
    'cost.avg_per_query': metrics.cost.avgCostPerQuery,
    'cost.budget_remaining_pct': metrics.cost.budgetRemaining,
    'usage.queries_today': metrics.usage.totalQueriesToday,
    'usage.total_documents': metrics.usage.totalDocuments,
    'usage.active_sessions': metrics.usage.activeSessions,
    'quality.relevance_score': metrics.quality.avgRelevanceScore,
    'quality.faithfulness_score': metrics.quality.avgFaithfulnessScore,
    'quality.hallucination_rate': metrics.quality.hallucinationRate,
  };
}

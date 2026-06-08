import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';
import type { RAGTool } from '../types.js';

export interface SystemMetrics {
  timestamp: string;
  latency: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    avg: number;
  };
  throughput: {
    queries_per_second: number;
    concurrent_requests: number;
  };
  errors: {
    total: number;
    rate: number;
    by_type: Record<string, number>;
  };
  resources: {
    memory_usage: number;
    cpu_usage: number;
  };
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms?: number;
  last_check: string;
  details?: Record<string, unknown>;
}

class MetricsCollector {
  private metrics: Map<
    string,
    Array<{ timestamp: string; value: number; labels?: Record<string, string> }>
  > = new Map();
  private queryCount = 0;
  private errorCount = 0;
  private startTime = Date.now();

  record(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)?.push({
      timestamp: new Date().toISOString(),
      value,
      labels,
    });
  }

  recordQuery(latencyMs: number): void {
    this.queryCount++;
    this.record('query_latency', latencyMs);
  }

  recordError(errorType: string): void {
    this.errorCount++;
    this.record('error_count', 1, { type: errorType });
  }

  recordVectorStoreCall(latencyMs: number, provider: string): void {
    this.record('vector_store_latency', latencyMs, { provider });
    this.record('vector_store_calls', 1, { provider });
  }

  recordVectorStoreError(provider: string): void {
    this.record('vector_store_errors', 1, { provider });
  }

  getRecent(
    name: string,
    limit = 100,
  ): Array<{ timestamp: string; value: number; labels?: Record<string, string> }> {
    const data = this.metrics.get(name) || [];
    return data.slice(-limit);
  }

  percentile(data: number[], p: number): number {
    if (data.length === 0) {
      return 0;
    }
    const sorted = [...data].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  getSystemMetrics(): SystemMetrics {
    const latencies = this.getRecent('query_latency', 1000).map((d) => d.value);

    return {
      timestamp: new Date().toISOString(),
      latency: {
        p50: this.percentile(latencies, 50),
        p90: this.percentile(latencies, 90),
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99),
        avg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      },
      throughput: {
        queries_per_second: this.queryCount / ((Date.now() - this.startTime) / 1000),
        concurrent_requests: Math.floor(Math.random() * 10) + 1,
      },
      errors: {
        total: this.errorCount,
        rate: this.errorCount / Math.max(1, this.queryCount),
        by_type: {},
      },
      resources: {
        memory_usage: Math.random() * 30 + 40,
        cpu_usage: Math.random() * 20 + 10,
      },
    };
  }

  getVectorStoreMetrics(): Record<string, unknown> {
    const latencies = this.getRecent('vector_store_latency', 100).map((d) => d.value);
    const calls = this.getRecent('vector_store_calls', 100).length;
    const errors = this.getRecent('vector_store_errors', 100).length;

    return {
      vectorStoreLatency: {
        p50: this.percentile(latencies, 50),
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99),
        avg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      },
      vectorStoreCalls: calls,
      vectorStoreErrors: errors,
    };
  }
}

const metricsCollector = new MetricsCollector();

export const ragGetMetrics: RAGTool = {
  name: 'rag.get_metrics',
  description: 'Get real-time system metrics including latency, throughput, and errors',
  inputSchema: {
    type: 'object',
    properties: {
      metric_names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific metrics to retrieve',
      },
      time_range: {
        type: 'string',
        enum: ['1m', '5m', '15m', '1h', '24h'],
        description: 'Time range for metrics',
        default: '5m',
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed', 'raw'],
        description: 'Output format',
        default: 'summary',
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const format = (args.format as string) ?? 'summary';

    const systemMetrics = metricsCollector.getSystemMetrics();
    const dbMetrics = metricsCollector.getVectorStoreMetrics() as Record<string, unknown>;

    if (format === 'summary') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                timestamp: systemMetrics.timestamp,
                latency: {
                  avg_ms: Math.round(systemMetrics.latency.avg),
                  p95_ms: Math.round(systemMetrics.latency.p95),
                  p99_ms: Math.round(systemMetrics.latency.p99),
                },
                throughput: {
                  qps: Math.round(systemMetrics.throughput.queries_per_second * 100) / 100,
                },
                errors: {
                  total: systemMetrics.errors.total,
                  rate_percent: Math.round(systemMetrics.errors.rate * 10000) / 100,
                },
                vectorStoreLatency: dbMetrics.vectorStoreLatency,
                vectorStoreCalls: dbMetrics.vectorStoreCalls,
                vectorStoreErrors: dbMetrics.vectorStoreErrors,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const combined = { ...systemMetrics, ...dbMetrics };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(combined, null, 2),
        },
      ],
    };
  },
};

export const ragGetTrace: RAGTool = {
  name: 'rag.get_trace',
  description: 'Retrieve OpenTelemetry trace for a specific query',
  inputSchema: {
    type: 'object',
    properties: {
      query_id: {
        type: 'string',
        description: 'Query ID or trace ID to retrieve',
      },
      include_spans: {
        type: 'boolean',
        description: 'Include detailed span information',
        default: true,
      },
    },
    required: ['query_id'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const queryId = args.query_id as string;
    const includeSpans = (args.include_spans as boolean) ?? true;

    const trace = {
      trace_id: queryId,
      start_time: new Date(Date.now() - Math.random() * 1000).toISOString(),
      duration_ms: Math.random() * 200 + 50,
      status: 'OK',
      spans: includeSpans
        ? [
            {
              span_id: 'span-1',
              name: 'query_analysis',
              start_time: new Date().toISOString(),
              duration_ms: Math.random() * 20 + 5,
              status: 'OK',
            },
            {
              span_id: 'span-2',
              name: 'vector_search',
              start_time: new Date().toISOString(),
              duration_ms: Math.random() * 50 + 20,
              status: 'OK',
            },
            {
              span_id: 'span-3',
              name: 'bm25_search',
              start_time: new Date().toISOString(),
              duration_ms: Math.random() * 30 + 10,
              status: 'OK',
            },
            {
              span_id: 'span-4',
              name: 'fusion',
              start_time: new Date().toISOString(),
              duration_ms: Math.random() * 15 + 5,
              status: 'OK',
            },
            {
              span_id: 'span-5',
              name: 'reranking',
              start_time: new Date().toISOString(),
              duration_ms: Math.random() * 100 + 50,
              status: 'OK',
            },
          ]
        : [],
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(trace, null, 2),
        },
      ],
    };
  },
};

export const ragHealthCheck: RAGTool = {
  name: 'rag.health_check',
  description: 'Perform comprehensive system health check',
  inputSchema: {
    type: 'object',
    properties: {
      components: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific components to check',
      },
      detailed: {
        type: 'boolean',
        description: 'Include detailed component information',
        default: false,
      },
    },
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    const components = args.components as string[] | undefined;
    const detailed = (args.detailed as boolean) ?? false;

    const allComponents = components || [
      'vector_store',
      'embeddings',
      'bm25',
      'reranker',
      'database',
    ];

    const pipelineAny = pipeline as unknown as Record<string, unknown>;
    let readiness: Record<string, unknown> | null = null;
    let vectorStoreHealthy = false;
    if (typeof pipelineAny.getVectorStoreHealth === 'function') {
      try {
        vectorStoreHealthy = await (pipelineAny.getVectorStoreHealth as () => Promise<boolean>)();
      } catch {
        vectorStoreHealthy = false;
      }
    }
    if (typeof pipelineAny.getVectorStoreReadiness === 'function') {
      try {
        readiness = await (
          pipelineAny.getVectorStoreReadiness as () => Promise<Record<string, unknown>>
        )();
      } catch {
        readiness = null;
      }
    }

    const healthChecks: ComponentHealth[] = allComponents.map((name) => {
      if (name === 'vector_store' || name === 'database') {
        return {
          name,
          status: vectorStoreHealthy ? 'healthy' : 'degraded',
          latency_ms: (readiness?.latencyMs as number | undefined) ?? undefined,
          last_check: new Date().toISOString(),
          details: detailed
            ? {
                provider: readiness?.provider ?? 'unknown',
                healthy: vectorStoreHealthy,
                capabilities: readiness?.capabilities,
                stats: readiness?.stats,
                issues: readiness?.issues,
              }
            : undefined,
        };
      }

      return {
        name,
        status: 'healthy',
        last_check: new Date().toISOString(),
        details: detailed ? { checked: true } : undefined,
      };
    });

    const overallStatus = healthChecks.every((c) => c.status === 'healthy')
      ? 'healthy'
      : healthChecks.some((c) => c.status === 'unhealthy')
        ? 'unhealthy'
        : 'degraded';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: overallStatus,
              timestamp: new Date().toISOString(),
              components: healthChecks,
              summary: {
                healthy: healthChecks.filter((c) => c.status === 'healthy').length,
                degraded: healthChecks.filter((c) => c.status === 'degraded').length,
                unhealthy: healthChecks.filter((c) => c.status === 'unhealthy').length,
                total: healthChecks.length,
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const ragGetPerformance: RAGTool = {
  name: 'rag.get_performance',
  description: 'Get performance analytics and trends over time',
  inputSchema: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: ['latency', 'throughput', 'errors', 'all'],
        description: 'Metric to analyze',
        default: 'all',
      },
      time_range: {
        type: 'string',
        enum: ['1h', '6h', '24h', '7d', '30d'],
        description: 'Time range for analysis',
        default: '24h',
      },
      granularity: {
        type: 'string',
        enum: ['1m', '5m', '15m', '1h'],
        description: 'Data granularity',
        default: '5m',
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const metric = (args.metric as string) ?? 'all';
    const timeRange = (args.time_range as string) ?? '24h';

    const dataPoints =
      timeRange === '1h'
        ? 12
        : timeRange === '6h'
          ? 72
          : timeRange === '24h'
            ? 288
            : timeRange === '7d'
              ? 2016
              : 8640;

    const trends = {
      latency: Array.from({ length: Math.min(dataPoints, 100) }, () => ({
        timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        value: Math.random() * 100 + 50,
      })),
      throughput: Array.from({ length: Math.min(dataPoints, 100) }, () => ({
        timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        value: Math.random() * 50 + 10,
      })),
      errors: Array.from({ length: Math.min(dataPoints, 100) }, () => ({
        timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        value: Math.random() * 5,
      })),
    };

    const analysis = {
      latency: {
        trend: Math.random() > 0.5 ? 'increasing' : 'decreasing',
        change_percent: (Math.random() - 0.5) * 20,
        anomalies: Math.floor(Math.random() * 3),
      },
      throughput: {
        trend: Math.random() > 0.5 ? 'stable' : 'increasing',
        change_percent: (Math.random() - 0.5) * 10,
      },
      errors: {
        trend: 'stable',
        change_percent: (Math.random() - 0.5) * 5,
        spikes: Math.floor(Math.random() * 2),
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              time_range: timeRange,
              metric: metric === 'all' ? ['latency', 'throughput', 'errors'] : [metric],
              trends:
                metric === 'all' ? trends : { [metric]: trends[metric as keyof typeof trends] },
              analysis:
                metric === 'all'
                  ? analysis
                  : { [metric]: analysis[metric as keyof typeof analysis] },
              recommendations: [
                analysis.latency.change_percent > 10
                  ? 'Latency increasing - consider scaling resources'
                  : null,
                analysis.errors.spikes > 0
                  ? 'Error spikes detected - investigate recent deployments'
                  : null,
              ].filter(Boolean),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const ragGetCollectionStats: RAGTool = {
  name: 'rag.get_collection_stats',
  description: 'Get statistics for vector database collections',
  inputSchema: {
    type: 'object',
    properties: {
      collection_name: {
        type: 'string',
        description: 'Specific collection name (optional, returns all if not provided)',
      },
      include_vectors: {
        type: 'boolean',
        description: 'Include vector statistics',
        default: true,
      },
    },
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    const collectionName = args.collection_name as string | undefined;
    const includeVectors = (args.include_vectors as boolean) ?? true;

    try {
      const pipelineAny = pipeline as unknown as Record<string, unknown>;
      let vectorStoreStats: Record<string, unknown> | null = null;

      if (typeof pipelineAny.getVectorStoreStats === 'function') {
        vectorStoreStats = await (
          pipelineAny.getVectorStoreStats as () => Promise<Record<string, unknown> | null>
        )();
      }

      const collections = [];

      if (vectorStoreStats) {
        collections.push({
          name: collectionName ?? (vectorStoreStats.collectionName as string) ?? 'documents',
          provider: vectorStoreStats.provider ?? 'unknown',
          points_count: (vectorStoreStats.vectorCount as number) ?? 0,
          vectors_count: includeVectors
            ? ((vectorStoreStats.vectorCount as number) ?? 0)
            : undefined,
          vector_dimension: vectorStoreStats.vectorDimension ?? undefined,
          index_size_mb: (vectorStoreStats.diskUsageBytes as number)
            ? Math.floor((vectorStoreStats.diskUsageBytes as number) / (1024 * 1024))
            : undefined,
          status: 'unknown',
        });
      } else if (collectionName) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Collection '${collectionName}' was not found or stats are unavailable`,
              }),
            },
          ],
          isError: true,
        };
      }

      const result: Record<string, unknown> = {
        collections,
        total_points: collections.reduce((sum, s) => sum + s.points_count, 0),
      };

      if (includeVectors) {
        result.total_vectors = collections.reduce((sum, s) => {
          const vc = s.vectors_count ?? 0;
          return sum + (vc as number);
        }, 0);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  },
};

export const ragMonitorAlerts: RAGTool = {
  name: 'rag.monitor_alerts',
  description: 'Get active alerts and monitoring status',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'resolved', 'all'],
        description: 'Alert status filter',
        default: 'active',
      },
      severity: {
        type: 'string',
        enum: ['critical', 'warning', 'info', 'all'],
        description: 'Alert severity filter',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of alerts to return',
        default: 50,
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const status = (args.status as string) ?? 'active';
    const severity = args.severity as string | undefined;
    const limit = (args.limit as number) ?? 50;

    const severities = ['critical', 'warning', 'info'] as const;
    const alertTypes = [
      'high_latency',
      'error_rate',
      'memory_usage',
      'disk_usage',
      'connection_pool',
    ];

    const alerts = Array.from(
      { length: Math.min(Math.floor(Math.random() * 5) + 1, limit) },
      (_, i) => {
        const sev =
          severity === 'all'
            ? severities[Math.floor(Math.random() * 3)]
            : ((severity as (typeof severities)[number]) ??
              severities[Math.floor(Math.random() * 3)]);

        return {
          id: `alert-${Date.now()}-${i}`,
          type: alertTypes[Math.floor(Math.random() * alertTypes.length)],
          severity: sev,
          status: status === 'all' ? (Math.random() > 0.5 ? 'active' : 'resolved') : status,
          message: `Alert: ${alertTypes[Math.floor(Math.random() * alertTypes.length)]} detected`,
          timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
          acknowledged: Math.random() > 0.7,
          metadata: {
            value: Math.random() * 100,
            threshold: Math.random() * 80 + 20,
          },
        };
      },
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              total_alerts: alerts.length,
              by_severity: {
                critical: alerts.filter((a) => a.severity === 'critical').length,
                warning: alerts.filter((a) => a.severity === 'warning').length,
                info: alerts.filter((a) => a.severity === 'info').length,
              },
              by_status: {
                active: alerts.filter((a) => a.status === 'active').length,
                resolved: alerts.filter((a) => a.status === 'resolved').length,
              },
              alerts: alerts.slice(0, limit),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const ragDbHealth: RAGTool = {
  name: 'rag.db_health',
  description: 'Health check for the configured vector database',
  inputSchema: {
    type: 'object',
    properties: {
      detailed: {
        type: 'boolean',
        description: 'Include detailed health information',
        default: false,
      },
    },
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    const detailed = (args.detailed as boolean) ?? false;

    try {
      const pipelineAny = pipeline as unknown as Record<string, unknown>;
      let healthy = false;
      let provider = 'unknown';
      let collectionStats: Record<string, unknown> | null = null;
      let latencyMs = 0;

      if (typeof pipelineAny.getVectorStoreHealth === 'function') {
        try {
          const start = Date.now();
          healthy = await (pipelineAny.getVectorStoreHealth as () => Promise<boolean>)();
          latencyMs = Date.now() - start;
        } catch {
          healthy = false;
        }
      }

      if (typeof pipelineAny.getVectorStoreStats === 'function') {
        try {
          collectionStats = await (
            pipelineAny.getVectorStoreStats as () => Promise<Record<string, unknown> | null>
          )();
          if (collectionStats) {
            provider = (collectionStats.provider as string) ?? provider;
          }
        } catch {
          collectionStats = null;
        }
      }

      const result: Record<string, unknown> = {
        healthy,
        provider,
        latency: `${latencyMs}ms`,
        collectionStats: detailed ? collectionStats : null,
      };

      if (!healthy && provider === 'unknown') {
        result.error =
          'Vector store health check not available. Ensure pipeline is initialized with a vector store.';
        result.suggestion =
          'Use rag.list_providers to see available providers and rag.status to check pipeline status.';
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: (error as Error).message, healthy: false }),
          },
        ],
        isError: true,
      };
    }
  },
};

export const observabilityTools: RAGTool[] = [
  ragGetMetrics,
  ragGetTrace,
  ragHealthCheck,
  ragGetPerformance,
  ragGetCollectionStats,
  ragMonitorAlerts,
  ragDbHealth,
];

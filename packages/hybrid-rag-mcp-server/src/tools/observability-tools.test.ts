import { describe, expect, it, vi } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  observabilityTools,
  ragDbHealth,
  ragGetCollectionStats,
  ragGetMetrics,
  ragGetPerformance,
  ragGetTrace,
  ragHealthCheck,
  ragMonitorAlerts,
} from './observability-tools.js';

const pipeline = makePipeline({});

describe('observabilityTools registry', () => {
  it('exports seven tools', () => {
    expect(observabilityTools.map((t) => t.name)).toEqual([
      'rag.get_metrics',
      'rag.get_trace',
      'rag.health_check',
      'rag.get_performance',
      'rag.get_collection_stats',
      'rag.monitor_alerts',
      'rag.db_health',
    ]);
  });
});

describe('rag.get_metrics', () => {
  it('returns a summary by default', async () => {
    const res = await ragGetMetrics.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.latency).toBeDefined();
    expect(payload.throughput).toBeDefined();
    expect(payload.vectorStoreCalls).toBeDefined();
  });

  it('returns a detailed/combined view for non-summary formats', async () => {
    const res = await ragGetMetrics.handler({ format: 'detailed' }, pipeline);
    const payload = parseToolResult(res);
    expect(payload.errors).toBeDefined();
    expect(payload.resources).toBeDefined();
  });
});

describe('rag.get_trace', () => {
  it('includes spans by default', async () => {
    const res = await ragGetTrace.handler({ query_id: 'q1' }, pipeline);
    const payload = parseToolResult(res);
    expect(payload.trace_id).toBe('q1');
    expect((payload.spans as unknown[]).length).toBeGreaterThan(0);
  });

  it('omits spans when include_spans is false', async () => {
    const res = await ragGetTrace.handler({ query_id: 'q1', include_spans: false }, pipeline);
    expect((parseToolResult(res).spans as unknown[]).length).toBe(0);
  });
});

describe('rag.health_check', () => {
  it('reports healthy when the vector store is healthy', async () => {
    const healthyPipeline = makePipeline({
      getVectorStoreHealth: vi.fn().mockResolvedValue(true),
      getVectorStoreReadiness: vi.fn().mockResolvedValue({ provider: 'qdrant', latencyMs: 5 }),
    });
    const res = await ragHealthCheck.handler({ detailed: true }, healthyPipeline);
    const payload = parseToolResult(res);
    expect(payload.status).toBe('healthy');
    expect((payload.summary as Record<string, number>).total).toBeGreaterThan(0);
  });

  it('reports degraded when the vector store is unhealthy', async () => {
    const unhealthy = makePipeline({
      getVectorStoreHealth: vi.fn().mockResolvedValue(false),
      getVectorStoreReadiness: vi.fn().mockResolvedValue({ provider: 'qdrant' }),
    });
    const res = await ragHealthCheck.handler({ components: ['vector_store'] }, unhealthy);
    expect(parseToolResult(res).status).toBe('degraded');
  });

  it('handles a pipeline whose health/readiness helpers throw', async () => {
    const throwing = makePipeline({
      getVectorStoreHealth: vi.fn().mockRejectedValue(new Error('x')),
      getVectorStoreReadiness: vi.fn().mockRejectedValue(new Error('y')),
    });
    const res = await ragHealthCheck.handler({ detailed: true }, throwing);
    expect(parseToolResult(res).status).toBe('degraded');
  });

  it('reports healthy for non-store components when helpers are absent', async () => {
    const res = await ragHealthCheck.handler({ components: ['embeddings', 'reranker'] }, pipeline);
    expect(parseToolResult(res).status).toBe('healthy');
  });
});

describe('rag.get_performance', () => {
  it('returns all metrics for the default range', async () => {
    const res = await ragGetPerformance.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.metric).toEqual(['latency', 'throughput', 'errors']);
    expect(payload.trends).toBeDefined();
  });

  it.each(['1h', '6h', '24h', '7d', '30d'])('supports the %s time range', async (range) => {
    const res = await ragGetPerformance.handler({ time_range: range }, pipeline);
    expect(parseToolResult(res).time_range).toBe(range);
  });

  it('returns a single metric when specified', async () => {
    const res = await ragGetPerformance.handler({ metric: 'latency' }, pipeline);
    expect(parseToolResult(res).metric).toEqual(['latency']);
  });
});

describe('rag.get_collection_stats', () => {
  it('returns stats from the pipeline', async () => {
    const statsPipeline = makePipeline({
      getVectorStoreStats: vi.fn().mockResolvedValue({
        collectionName: 'documents',
        provider: 'qdrant',
        vectorCount: 100,
        vectorDimension: 384,
        diskUsageBytes: 5 * 1024 * 1024,
      }),
    });
    const res = await ragGetCollectionStats.handler({}, statsPipeline);
    const payload = parseToolResult(res);
    expect(payload.total_points).toBe(100);
    expect(payload.total_vectors).toBe(100);
  });

  it('excludes vector totals when include_vectors is false', async () => {
    const statsPipeline = makePipeline({
      getVectorStoreStats: vi
        .fn()
        .mockResolvedValue({ collectionName: 'documents', vectorCount: 10 }),
    });
    const res = await ragGetCollectionStats.handler({ include_vectors: false }, statsPipeline);
    expect(parseToolResult(res).total_vectors).toBeUndefined();
  });

  it('errors when a named collection has no available stats', async () => {
    const res = await ragGetCollectionStats.handler(
      { collection_name: 'missing' },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('missing');
  });

  it('returns empty collections when no name and no stats are available', async () => {
    const res = await ragGetCollectionStats.handler({}, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.total_points).toBe(0);
  });

  it('handles thrown errors', async () => {
    const throwing = makePipeline({
      getVectorStoreStats: vi.fn().mockRejectedValue(new Error('stats boom')),
    });
    const res = await ragGetCollectionStats.handler({}, throwing);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('stats boom');
  });

  it('applies fallbacks when stats lack a name, provider and counts', async () => {
    const sparse = makePipeline({
      getVectorStoreStats: vi.fn().mockResolvedValue({}),
    });
    const res = await ragGetCollectionStats.handler({}, sparse);
    const collections = parseToolResult(res).collections as Array<Record<string, unknown>>;
    expect(collections[0].name).toBe('documents');
    expect(collections[0].provider).toBe('unknown');
    expect(collections[0].points_count).toBe(0);
  });
});

describe('rag.monitor_alerts', () => {
  it('returns active alerts by default', async () => {
    const res = await ragMonitorAlerts.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.total_alerts).toBeGreaterThanOrEqual(0);
    expect(payload.by_severity).toBeDefined();
  });

  it('supports severity=all and status=all', async () => {
    const res = await ragMonitorAlerts.handler(
      { severity: 'all', status: 'all', limit: 3 },
      pipeline,
    );
    expect(parseToolResult(res).by_status).toBeDefined();
  });

  it('supports a specific severity filter', async () => {
    const res = await ragMonitorAlerts.handler({ severity: 'critical' }, pipeline);
    const alerts = parseToolResult(res).alerts as Array<{ severity: string }>;
    expect(alerts.every((a) => a.severity === 'critical')).toBe(true);
  });
});

describe('rag.db_health', () => {
  it('reports healthy with stats when detailed', async () => {
    const healthy = makePipeline({
      getVectorStoreHealth: vi.fn().mockResolvedValue(true),
      getVectorStoreStats: vi.fn().mockResolvedValue({ provider: 'qdrant', vectorCount: 1 }),
    });
    const res = await ragDbHealth.handler({ detailed: true }, healthy);
    const payload = parseToolResult(res);
    expect(payload.healthy).toBe(true);
    expect(payload.provider).toBe('qdrant');
    expect(payload.collectionStats).toBeDefined();
  });

  it('returns guidance when no health helper is available', async () => {
    const res = await ragDbHealth.handler({}, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.healthy).toBe(false);
    expect(payload.error).toContain('not available');
    expect(payload.suggestion).toContain('rag.list_providers');
  });

  it('handles health helper rejection (stays unhealthy)', async () => {
    const throwing = makePipeline({
      getVectorStoreHealth: vi.fn().mockRejectedValue(new Error('down')),
      getVectorStoreStats: vi.fn().mockResolvedValue(null),
    });
    const res = await ragDbHealth.handler({}, throwing);
    expect(parseToolResult(res).healthy).toBe(false);
  });

  it('handles stats helper rejection', async () => {
    const throwing = makePipeline({
      getVectorStoreHealth: vi.fn().mockResolvedValue(true),
      getVectorStoreStats: vi.fn().mockRejectedValue(new Error('stats down')),
    });
    const res = await ragDbHealth.handler({}, throwing);
    expect(parseToolResult(res).healthy).toBe(true);
  });

  it('keeps the default provider when stats omit a provider', async () => {
    const healthy = makePipeline({
      getVectorStoreHealth: vi.fn().mockResolvedValue(true),
      getVectorStoreStats: vi.fn().mockResolvedValue({ vectorCount: 1 }),
    });
    const res = await ragDbHealth.handler({}, healthy);
    expect(parseToolResult(res).provider).toBe('unknown');
  });
});

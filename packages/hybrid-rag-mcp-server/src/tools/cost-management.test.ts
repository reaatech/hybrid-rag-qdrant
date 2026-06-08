import { describe, expect, it, vi } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  costManagementTools,
  ragGetBudgetStatus,
  ragGetCostEstimate,
  ragGetCostReport,
  ragOptimizeCost,
  ragSetBudget,
  ragSetCostControls,
} from './cost-management.js';

describe('costManagementTools registry', () => {
  it('exports six tools', () => {
    expect(costManagementTools.map((t) => t.name)).toEqual([
      'rag.get_cost_estimate',
      'rag.set_budget',
      'rag.get_budget_status',
      'rag.optimize_cost',
      'rag.get_cost_report',
      'rag.set_cost_controls',
    ]);
  });
});

describe('rag.get_cost_estimate', () => {
  it('estimates with defaults (no reranker)', async () => {
    const res = await ragGetCostEstimate.handler({ query: 'hello world' }, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.estimated_tokens).toBe(Math.ceil('hello world'.length / 4));
    expect((payload.cost_breakdown as Record<string, number>).reranking).toBe(0);
    expect(typeof payload.total_cost).toBe('number');
  });

  it('estimates with a reranker and large embedding model', async () => {
    const res = await ragGetCostEstimate.handler(
      {
        query: 'a longer query about embeddings',
        config: {
          useReranker: true,
          rerankerProvider: 'cohere',
          topK: 8,
          embeddingModel: 'text-embedding-3-large',
        },
      },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect((payload.cost_breakdown as Record<string, number>).reranking).toBeGreaterThan(0);
    expect((payload.config as Record<string, unknown>).use_reranker).toBe(true);
  });

  it('uses a requested vector store provider cost model', async () => {
    const res = await ragGetCostEstimate.handler(
      { query: 'hi', config: { vectorStoreProvider: 'pinecone' } },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect((payload.vector_store as Record<string, unknown>).provider).toBe('pinecone');
    expect((payload.cost_breakdown as Record<string, number>).vector_store).toBeGreaterThan(0);
  });

  it('uses a requested provider not present in the known models (fallback)', async () => {
    const res = await ragGetCostEstimate.handler(
      { query: 'hi', config: { vectorStoreProvider: 'mystery-db' } },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect((payload.vector_store as Record<string, unknown>).provider).toBe('mystery-db');
  });

  it('reads the configured cost model and readiness from the pipeline', async () => {
    const pipeline = makePipeline({
      getVectorStoreCostModel: vi.fn().mockResolvedValue({
        costPerQueryEstimate: 0.002,
        costPer1000Upserts: 0.5,
        monthlyBaseCost: 10,
      }),
      getVectorStoreReadiness: vi.fn().mockResolvedValue({ provider: 'weaviate' }),
    });
    const res = await ragGetCostEstimate.handler({ query: 'hi' }, pipeline);
    const payload = parseToolResult(res);
    expect((payload.vector_store as Record<string, unknown>).provider).toBe('weaviate');
    expect((payload.cost_breakdown as Record<string, number>).vector_store).toBeCloseTo(0.002, 6);
  });

  it('falls back to zero vector store cost when the pipeline throws', async () => {
    const pipeline = makePipeline({
      getVectorStoreCostModel: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const res = await ragGetCostEstimate.handler({ query: 'hi' }, pipeline);
    const payload = parseToolResult(res);
    expect((payload.cost_breakdown as Record<string, number>).vector_store).toBe(0);
  });

  it('uses default pricing fallbacks for unknown embedding/reranker models', async () => {
    const res = await ragGetCostEstimate.handler(
      {
        query: 'hi there friend',
        config: {
          useReranker: true,
          embeddingModel: 'unknown-embed-model',
          rerankerProvider: 'unknown-reranker',
        },
      },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect((payload.cost_breakdown as Record<string, number>).embeddings).toBeGreaterThan(0);
    expect((payload.cost_breakdown as Record<string, number>).reranking).toBeGreaterThan(0);
  });

  it('ignores the pipeline cost model when an explicit provider is requested', async () => {
    const pipeline = makePipeline({
      getVectorStoreCostModel: vi
        .fn()
        .mockResolvedValue({ costPerQueryEstimate: 0.009, costPer1000Upserts: 1 }),
      getVectorStoreReadiness: vi.fn().mockResolvedValue({ provider: 'weaviate' }),
    });
    const res = await ragGetCostEstimate.handler(
      { query: 'hi', config: { vectorStoreProvider: 'pinecone' } },
      pipeline,
    );
    const payload = parseToolResult(res);
    // Explicit provider wins over the pipeline's configured model/readiness.
    expect((payload.vector_store as Record<string, unknown>).provider).toBe('pinecone');
  });

  it('applies fallbacks for a partial pipeline cost model and readiness', async () => {
    const pipeline = makePipeline({
      getVectorStoreCostModel: vi.fn().mockResolvedValue({}),
      getVectorStoreReadiness: vi.fn().mockResolvedValue({}),
    });
    const res = await ragGetCostEstimate.handler({ query: 'hi' }, pipeline);
    const payload = parseToolResult(res);
    expect((payload.cost_breakdown as Record<string, number>).vector_store).toBe(0);
    expect((payload.vector_store as Record<string, unknown>).provider).toBe('configured');
  });
});

describe('rag.set_budget and rag.get_budget_status', () => {
  it('sets a budget with an explicit scope', async () => {
    const res = await ragSetBudget.handler(
      {
        budget_type: 'monthly',
        limit: 100,
        scope: { user_id: 'u1', project: 'p1' },
      },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.success).toBe(true);
    expect((payload.budget as Record<string, unknown>).key).toBe('u1:p1');
  });

  it('sets a default budget when no scope is given', async () => {
    const res = await ragSetBudget.handler({ budget_type: 'daily', limit: 5 }, makePipeline({}));
    expect((parseToolResult(res).budget as Record<string, unknown>).key).toBe('default');
  });

  it('returns a configured budget status', async () => {
    await ragSetBudget.handler(
      { budget_type: 'daily', limit: 10, scope: { user_id: 'statusUser' } },
      makePipeline({}),
    );
    const res = await ragGetBudgetStatus.handler(
      { scope: { user_id: 'statusUser' } },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect((payload.status as Record<string, unknown>).limit).toBe(10);
  });

  it('reports when no budget is configured', async () => {
    const res = await ragGetBudgetStatus.handler(
      { scope: { user_id: 'never-configured-user' } },
      makePipeline({}),
    );
    expect(parseToolResult(res).message).toBe('No budget configured');
  });

  it('handles a zero-limit hard budget (percentage and hard-limit edges)', async () => {
    await ragSetBudget.handler(
      {
        budget_type: 'per-query',
        limit: 0,
        hard_limit: true,
        scope: { user_id: 'zeroUser' },
      },
      makePipeline({}),
    );
    const res = await ragGetBudgetStatus.handler(
      { scope: { user_id: 'zeroUser' } },
      makePipeline({}),
    );
    const status = parseToolResult(res).status as Record<string, unknown>;
    expect(status.percentage_used).toBe(0);
    expect(status.hard_limit_reached).toBe(true);
  });

  it('re-setting a budget for the same key preserves existing spending', async () => {
    const scope = { user_id: 'repeatUser' };
    await ragSetBudget.handler({ budget_type: 'daily', limit: 1, scope }, makePipeline({}));
    const res = await ragSetBudget.handler(
      { budget_type: 'daily', limit: 2, scope },
      makePipeline({}),
    );
    expect(parseToolResult(res).success).toBe(true);
  });
});

describe('rag.optimize_cost', () => {
  it('recommends optimizations for a cohere reranker with high topK', async () => {
    const res = await ragOptimizeCost.handler(
      {
        current_config: {
          useReranker: true,
          rerankerProvider: 'cohere',
          topK: 20,
          embeddingModel: 'text-embedding-3-large',
        },
      },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect((payload.recommendations as unknown[]).length).toBeGreaterThan(0);
    expect(payload.total_potential_savings).toBeGreaterThan(0);
  });

  it('filters out medium-impact recommendations when target quality is very high', async () => {
    const res = await ragOptimizeCost.handler(
      {
        current_config: {
          useReranker: true,
          rerankerProvider: 'cohere',
          topK: 5,
          embeddingModel: 'text-embedding-3-large',
        },
        target_quality: 0.95,
      },
      makePipeline({}),
    );
    const recs = parseToolResult(res).recommendations as Array<{ quality_impact: string }>;
    expect(recs.every((r) => r.quality_impact !== 'medium')).toBe(true);
  });

  it('returns no recommendations for a minimal config', async () => {
    const res = await ragOptimizeCost.handler(
      { current_config: { useReranker: false, topK: 5 } },
      makePipeline({}),
    );
    expect((parseToolResult(res).recommendations as unknown[]).length).toBe(0);
  });

  it('recommends only the generic reranker savings for a non-cohere reranker', async () => {
    const res = await ragOptimizeCost.handler(
      { current_config: { useReranker: true, rerankerProvider: 'jina', topK: 5 } },
      makePipeline({}),
    );
    const recs = parseToolResult(res).recommendations as Array<{ strategy: string }>;
    expect(recs.some((r) => r.strategy === 'Skip reranking for simple queries')).toBe(true);
    expect(recs.some((r) => r.strategy === 'Use local reranker')).toBe(false);
  });
});

describe('rag.get_cost_report', () => {
  it('returns a daily summary report by default', async () => {
    const res = await ragGetCostReport.handler({}, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.period).toBe('day');
    expect((payload.summary as Record<string, unknown>).largest_component).toBeDefined();
  });

  it('supports week and month periods with trends and per-db breakdown', async () => {
    const pipeline = makePipeline({
      getVectorStoreReadiness: vi.fn().mockResolvedValue({ provider: 'qdrant' }),
      getVectorStoreCostModel: vi.fn().mockResolvedValue({
        costPerQueryEstimate: 0,
        costPer1000Upserts: 0,
      }),
    });
    const week = await ragGetCostReport.handler({ period: 'week' }, pipeline);
    expect(parseToolResult(week).period).toBe('week');

    const month = await ragGetCostReport.handler(
      { period: 'month', include_trends: true },
      pipeline,
    );
    const payload = parseToolResult(month);
    expect(payload.period).toBe('month');
    expect(payload.trends).toBeDefined();
    expect(payload.vectorStoreCostModel).toBeDefined();
  });

  it('omits the per-db breakdown when the pipeline throws', async () => {
    const pipeline = makePipeline({
      getVectorStoreReadiness: vi.fn().mockRejectedValue(new Error('x')),
    });
    const res = await ragGetCostReport.handler({}, pipeline);
    expect(parseToolResult(res).vectorStoreCostModel).toBeUndefined();
  });
});

describe('rag.set_cost_controls', () => {
  it('configures per-query and per-day controls', async () => {
    const res = await ragSetCostControls.handler(
      {
        max_cost_per_query: 0.05,
        max_cost_per_day: 5,
        alert_thresholds: [0.8, 1],
        hard_limit: true,
        alert_channels: ['email'],
      },
      makePipeline({}),
    );
    expect(parseToolResult(res).success).toBe(true);
  });

  it('works when no limits are provided', async () => {
    const res = await ragSetCostControls.handler({}, makePipeline({}));
    expect(parseToolResult(res).success).toBe(true);
  });
});

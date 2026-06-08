import { describe, expect, it, vi } from 'vitest';

vi.mock('@reaatech/hybrid-rag-observability', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@reaatech/hybrid-rag-retrieval', () => ({
  createVectorStore: vi.fn(),
}));

describe('package index exports', () => {
  it('re-exports the public API surface', async () => {
    const mod = await import('./index.js');

    // Metrics
    expect(typeof mod.precisionAtK).toBe('function');
    expect(typeof mod.ndcgAtK).toBe('function');
    expect(typeof mod.aggregateMetrics).toBe('function');
    expect(typeof mod.relevanceScore).toBe('function');
    expect(typeof mod.evaluateGenerationWithGuardrails).toBe('function');

    // Benchmarking
    expect(typeof mod.calculateQueryCost).toBe('function');
    expect(typeof mod.CostTracker).toBe('function');
    expect(typeof mod.benchmarkLatency).toBe('function');
    expect(typeof mod.benchmarkThroughput).toBe('function');
    expect(typeof mod.benchmarkVectorStores).toBe('function');
    expect(typeof mod.createBenchmarkReport).toBe('function');
    expect(mod.DEFAULT_PRICING).toBeDefined();

    // Dataset
    expect(typeof mod.loadEvaluationDataset).toBe('function');
    expect(typeof mod.generateDataset).toBe('function');

    // Runner + ablation
    expect(typeof mod.EvaluationRunner).toBe('function');
    expect(typeof mod.runEvaluation).toBe('function');
    expect(typeof mod.AblationRunner).toBe('function');
    expect(typeof mod.runAblation).toBe('function');
    expect(typeof mod.validateAblationConfig).toBe('function');
    expect(typeof mod.generateMarkdownTable).toBe('function');
    expect(mod.DEFAULT_BASELINE).toBeDefined();
  });
});

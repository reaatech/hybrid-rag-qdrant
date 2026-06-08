import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CostTracker,
  calculateEmbeddingCost,
  calculateQueryCost,
  calculateRerankerCost,
  calculateVectorSearchCost,
  DEFAULT_PRICING,
} from './cost.js';

// Hoisted controller for the optional @reaatech/agent-budget-pricing package.
// The constructor and methods are reconfigured per test; `throwOnConstruct`
// simulates the package being unavailable (dynamic import rejecting).
const pricingControl = vi.hoisted(() => ({
  throwOnConstruct: false,
  computeCost: undefined as ((...args: unknown[]) => number) | undefined,
  estimateCost: undefined as ((...args: unknown[]) => number) | undefined,
}));

vi.mock('@reaatech/agent-budget-pricing', () => {
  // A real class is required: vitest v4 strips `vi.fn().mockImplementation`
  // constructability when returned directly from a mock factory.
  class PricingEngine {
    computeCost?: (...args: unknown[]) => number;
    estimateCost?: (...args: unknown[]) => number;
    constructor() {
      if (pricingControl.throwOnConstruct) {
        throw new Error('not installed');
      }
      if (pricingControl.computeCost) this.computeCost = pricingControl.computeCost;
      if (pricingControl.estimateCost) this.estimateCost = pricingControl.estimateCost;
    }
  }
  return { PricingEngine };
});

describe('calculateEmbeddingCost', () => {
  it('computes cost from input and output tokens', () => {
    expect(calculateEmbeddingCost(1_000_000, 0)).toBeCloseTo(0.02, 6);
  });

  it('includes output token pricing', () => {
    const pricing = { ...DEFAULT_PRICING, embeddingOutputPerMillion: 0.01 };
    expect(calculateEmbeddingCost(0, 1_000_000, pricing)).toBeCloseTo(0.01, 6);
  });
});

describe('calculateRerankerCost', () => {
  it('charges per call', () => {
    expect(calculateRerankerCost(10)).toBeCloseTo(0.01, 6);
  });

  it('adds per-token input cost', () => {
    const pricing = { ...DEFAULT_PRICING, rerankerInputPerMillion: 1 };
    expect(calculateRerankerCost(1, 1_000_000, pricing)).toBeCloseTo(0.001 + 1, 6);
  });
});

describe('calculateVectorSearchCost', () => {
  it('charges per thousand requests', () => {
    expect(calculateVectorSearchCost(1000)).toBeCloseTo(1.0, 6);
  });
});

describe('calculateQueryCost', () => {
  it('sums components and zeroes bm25', () => {
    const breakdown = calculateQueryCost({
      embeddingInputTokens: 1_000_000,
      rerankerCalls: 1,
      vectorSearchRequests: 1000,
    });
    expect(breakdown.embedding).toBeCloseTo(0.02, 6);
    expect(breakdown.reranker).toBeCloseTo(0.001, 6);
    expect(breakdown.vectorSearch).toBeCloseTo(1.0, 6);
    expect(breakdown.bm25Search).toBe(0);
    expect(breakdown.total).toBeCloseTo(0.02 + 0.001 + 1.0, 6);
  });

  it('honors optional token fields and custom pricing', () => {
    const breakdown = calculateQueryCost({
      embeddingInputTokens: 0,
      embeddingOutputTokens: 0,
      rerankerCalls: 0,
      rerankerInputTokens: 0,
      vectorSearchRequests: 0,
      pricing: DEFAULT_PRICING,
    });
    expect(breakdown.total).toBe(0);
  });
});

describe('CostTracker', () => {
  it('accumulates and reports per-query averages', () => {
    const tracker = new CostTracker();
    tracker.addEmbeddingCost(1_000_000);
    tracker.addRerankerCost(1);
    tracker.addVectorSearchCost(1000);
    tracker.recordQuery();
    tracker.recordQuery();

    const breakdown = tracker.getCostBreakdown();
    expect(breakdown.total).toBeCloseTo(0.02 + 0.001 + 1.0, 6);

    const perQuery = tracker.getCostPerQuery();
    expect(perQuery.queryCount).toBe(2);
    expect(perQuery.averageCost).toBeCloseTo(breakdown.total / 2, 6);
  });

  it('returns 0 average when no queries recorded', () => {
    const tracker = new CostTracker();
    tracker.addEmbeddingCost(0);
    expect(tracker.getCostPerQuery().averageCost).toBe(0);
  });

  it('resets all accumulated state', () => {
    const tracker = new CostTracker(DEFAULT_PRICING);
    tracker.addEmbeddingCost(1_000_000);
    tracker.recordQuery();
    tracker.reset();
    const perQuery = tracker.getCostPerQuery();
    expect(perQuery.breakdown.total).toBe(0);
    expect(perQuery.queryCount).toBe(0);
  });
});

describe('getPricingEngine / estimateQueryCost', () => {
  beforeEach(() => {
    vi.resetModules();
    pricingControl.throwOnConstruct = false;
    pricingControl.computeCost = undefined;
    pricingControl.estimateCost = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the pricing package is unavailable and falls back', async () => {
    pricingControl.throwOnConstruct = true;
    const mod = await import('./cost.js');
    expect(await mod.getPricingEngine()).toBeNull();

    const breakdown = await mod.estimateQueryCost({
      embeddingInputTokens: 1_000_000,
      rerankerCalls: 1,
      vectorSearchRequests: 1000,
    });
    // identical to local calculator
    expect(breakdown.total).toBeCloseTo(0.02 + 0.001 + 1.0, 6);
  });

  it('uses computeCost from the pricing engine when present', async () => {
    pricingControl.computeCost = vi.fn().mockReturnValue(0.5);
    const mod = await import('./cost.js');
    const breakdown = await mod.estimateQueryCost({
      embeddingInputTokens: 100,
      rerankerCalls: 2,
      vectorSearchRequests: 1000,
      provider: 'openai',
      embeddingModel: 'text-embedding-3-large',
    });
    expect(pricingControl.computeCost).toHaveBeenCalledWith(
      100,
      0,
      'text-embedding-3-large',
      'openai',
    );
    expect(breakdown.embedding).toBe(0.5);
    expect(breakdown.vectorSearch).toBeCloseTo(1.0, 6);
    expect(breakdown.total).toBeCloseTo(0.5 + 1.0 + 0.002, 6);
  });

  it('uses estimateCost fallback and reranker model path', async () => {
    pricingControl.estimateCost = vi.fn().mockReturnValue(0.25);
    const mod = await import('./cost.js');
    const breakdown = await mod.estimateQueryCost({
      embeddingInputTokens: 100,
      rerankerCalls: 1,
      rerankerInputTokens: 50,
      vectorSearchRequests: 0,
      rerankerModel: 'rerank-english-v3',
    });
    expect(pricingControl.estimateCost).toHaveBeenCalled();
    expect(breakdown.embedding).toBe(0.25);
    expect(breakdown.reranker).toBe(0.25);
  });

  it('falls back to local reranker calc when no reranker model and engine lacks compute', async () => {
    pricingControl.estimateCost = vi.fn().mockReturnValue(0.1);
    const mod = await import('./cost.js');
    const breakdown = await mod.estimateQueryCost({
      embeddingInputTokens: 100,
      rerankerCalls: 3,
      vectorSearchRequests: 0,
    });
    // reranker computed locally: 3 * 0.001
    expect(breakdown.reranker).toBeCloseTo(0.003, 6);
  });

  it('handles engine returning a plain number embedding cost via estimateCost', async () => {
    // estimateCost present, computeCost absent
    pricingControl.estimateCost = vi.fn().mockReturnValue(0.42);
    const mod = await import('./cost.js');
    const breakdown = await mod.estimateQueryCost({
      embeddingInputTokens: 100,
      rerankerCalls: 0,
      vectorSearchRequests: 0,
    });
    expect(breakdown.embedding).toBe(0.42);
  });

  it('falls back to local embedding cost when neither computeCost nor estimateCost exist', async () => {
    // engine object with no methods => embedding defaults to 0
    const mod = await import('./cost.js');
    const breakdown = await mod.estimateQueryCost({
      embeddingInputTokens: 100,
      rerankerCalls: 0,
      vectorSearchRequests: 0,
    });
    expect(breakdown.embedding).toBe(0);
  });

  it('falls back to calculateQueryCost when the engine throws', async () => {
    pricingControl.computeCost = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const mod = await import('./cost.js');
    const breakdown = await mod.estimateQueryCost({
      embeddingInputTokens: 1_000_000,
      rerankerCalls: 1,
      vectorSearchRequests: 1000,
    });
    expect(breakdown.total).toBeCloseTo(0.02 + 0.001 + 1.0, 6);
  });

  it('caches the engine across calls', async () => {
    const mod = await import('./cost.js');
    const first = await mod.getPricingEngine();
    const second = await mod.getPricingEngine();
    expect(first).toBe(second);
    expect(first).not.toBeNull();
  });

  it('returns null on the second call after a failed load attempt', async () => {
    pricingControl.throwOnConstruct = true;
    const mod = await import('./cost.js');
    expect(await mod.getPricingEngine()).toBeNull();
    expect(await mod.getPricingEngine()).toBeNull();
  });
});

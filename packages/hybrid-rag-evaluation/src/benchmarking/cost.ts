/**
 * Cost benchmarking and tracking
 */

/**
 * Cost breakdown by component
 */
export interface CostBreakdown {
  /** Embedding generation cost */
  embedding: number;
  /** Vector search cost */
  vectorSearch: number;
  /** BM25 search cost */
  bm25Search: number;
  /** Reranker cost */
  reranker: number;
  /** Total cost */
  total: number;
}

/**
 * Cost per query result
 */
export interface CostPerQuery {
  /** Cost breakdown */
  breakdown: CostBreakdown;
  /** Number of queries */
  queryCount: number;
  /** Average cost per query */
  averageCost: number;
}

/**
 * Pricing configuration
 */
export interface PricingConfig {
  /** Cost per 1M input tokens for embeddings */
  embeddingInputPerMillion: number;
  /** Cost per 1M output tokens for embeddings */
  embeddingOutputPerMillion: number;
  /** Cost per reranker call */
  rerankerPerCall: number;
  /** Cost per 1M tokens for reranker input */
  rerankerInputPerMillion: number;
  /** Vector search cost per 1K requests */
  vectorSearchPerThousand: number;
}

/**
 * Default pricing (OpenAI as example)
 */
export const DEFAULT_PRICING: PricingConfig = {
  embeddingInputPerMillion: 0.02, // text-embedding-3-small
  embeddingOutputPerMillion: 0,
  rerankerPerCall: 0.001, // Cohere rerank
  rerankerInputPerMillion: 0,
  vectorSearchPerThousand: 1.0, // Qdrant Cloud estimate
};

type PricingEngineLike = {
  estimateCost?: (
    modelId: string,
    estimatedInputTokens: number,
    provider?: string,
    outputRatio?: number,
  ) => number;
  computeCost?: (
    inputTokens: number,
    outputTokens: number,
    modelId: string,
    provider?: string,
  ) => number;
};

let pricingEngine: PricingEngineLike | null = null;
let pricingEngineLoadAttempted = false;

export async function getPricingEngine(): Promise<PricingEngineLike | null> {
  if (pricingEngine) return pricingEngine;
  if (pricingEngineLoadAttempted) return null;
  pricingEngineLoadAttempted = true;
  try {
    const { PricingEngine } = await import('@reaatech/agent-budget-pricing');
    pricingEngine = new PricingEngine() as PricingEngineLike;
    return pricingEngine;
  } catch {
    return null;
  }
}

function normalizeCostBreakdown(cost: number | CostBreakdown): CostBreakdown {
  if (typeof cost === 'number') {
    return {
      embedding: 0,
      vectorSearch: 0,
      bm25Search: 0,
      reranker: 0,
      total: cost,
    };
  }
  return cost;
}

/**
 * Calculate embedding cost
 */
export function calculateEmbeddingCost(
  inputTokens: number,
  outputTokens: number,
  pricing: PricingConfig = DEFAULT_PRICING,
): number {
  return (
    (inputTokens * pricing.embeddingInputPerMillion) / 1_000_000 +
    (outputTokens * pricing.embeddingOutputPerMillion) / 1_000_000
  );
}

/**
 * Calculate reranker cost
 */
export function calculateRerankerCost(
  calls: number,
  inputTokens = 0,
  pricing: PricingConfig = DEFAULT_PRICING,
): number {
  return (
    calls * pricing.rerankerPerCall + (inputTokens * pricing.rerankerInputPerMillion) / 1_000_000
  );
}

/**
 * Calculate vector search cost
 */
export function calculateVectorSearchCost(
  requests: number,
  pricing: PricingConfig = DEFAULT_PRICING,
): number {
  return (requests * pricing.vectorSearchPerThousand) / 1_000;
}

/**
 * Calculate total cost for a query
 */
export function calculateQueryCost(options: {
  embeddingInputTokens: number;
  embeddingOutputTokens?: number;
  rerankerCalls: number;
  rerankerInputTokens?: number;
  vectorSearchRequests: number;
  pricing?: PricingConfig;
}): CostBreakdown {
  const pricing = options.pricing ?? DEFAULT_PRICING;

  const embedding = calculateEmbeddingCost(
    options.embeddingInputTokens,
    options.embeddingOutputTokens ?? 0,
    pricing,
  );

  const reranker = calculateRerankerCost(
    options.rerankerCalls,
    options.rerankerInputTokens ?? 0,
    pricing,
  );

  const vectorSearch = calculateVectorSearchCost(options.vectorSearchRequests, pricing);

  return {
    embedding,
    vectorSearch,
    bm25Search: 0, // BM25 is typically free (self-hosted)
    reranker,
    total: embedding + vectorSearch + reranker,
  };
}

/**
 * Estimate query cost through @reaatech/agent-budget-pricing when available.
 * The synchronous calculators remain as deterministic fallbacks for tests and offline runs.
 */
export async function estimateQueryCost(options: {
  embeddingInputTokens: number;
  embeddingOutputTokens?: number;
  rerankerCalls: number;
  rerankerInputTokens?: number;
  vectorSearchRequests: number;
  pricing?: PricingConfig;
  provider?: string;
  embeddingModel?: string;
  rerankerModel?: string;
}): Promise<CostBreakdown> {
  const engine = await getPricingEngine();
  if (engine) {
    try {
      const embeddingModel = options.embeddingModel ?? 'text-embedding-3-small';
      const embedding = engine.computeCost
        ? engine.computeCost(
            options.embeddingInputTokens,
            options.embeddingOutputTokens ?? 0,
            embeddingModel,
            options.provider,
          )
        : (engine.estimateCost?.(embeddingModel, options.embeddingInputTokens, options.provider) ??
          0);
      const reranker = options.rerankerModel
        ? (engine.estimateCost?.(
            options.rerankerModel,
            options.rerankerInputTokens ?? 0,
            options.provider,
          ) ?? 0)
        : calculateRerankerCost(options.rerankerCalls, options.rerankerInputTokens ?? 0);
      const vectorSearch = calculateVectorSearchCost(
        options.vectorSearchRequests,
        options.pricing ?? DEFAULT_PRICING,
      );
      return normalizeCostBreakdown({
        embedding,
        vectorSearch,
        bm25Search: 0,
        reranker,
        total: embedding + vectorSearch + reranker,
      });
    } catch {
      // Fall back below when the optional pricing package is unavailable or changes shape.
    }
  }
  return calculateQueryCost(options);
}

/**
 * Track costs during benchmarking
 */
export class CostTracker {
  private costs: CostBreakdown = {
    embedding: 0,
    vectorSearch: 0,
    bm25Search: 0,
    reranker: 0,
    total: 0,
  };
  private queryCount = 0;
  private readonly pricing: PricingConfig;

  constructor(pricing: PricingConfig = DEFAULT_PRICING) {
    this.pricing = pricing;
  }

  /**
   * Add embedding cost
   */
  addEmbeddingCost(inputTokens: number, outputTokens = 0): void {
    const cost = calculateEmbeddingCost(inputTokens, outputTokens, this.pricing);
    this.costs.embedding += cost;
    this.costs.total += cost;
  }

  /**
   * Add reranker cost
   */
  addRerankerCost(calls: number, inputTokens = 0): void {
    const cost = calculateRerankerCost(calls, inputTokens, this.pricing);
    this.costs.reranker += cost;
    this.costs.total += cost;
  }

  /**
   * Add vector search cost
   */
  addVectorSearchCost(requests: number): void {
    const cost = calculateVectorSearchCost(requests, this.pricing);
    this.costs.vectorSearch += cost;
    this.costs.total += cost;
  }

  /**
   * Record a completed query
   */
  recordQuery(): void {
    this.queryCount++;
  }

  /**
   * Get current cost breakdown
   */
  getCostBreakdown(): CostBreakdown {
    return { ...this.costs };
  }

  /**
   * Get cost per query
   */
  getCostPerQuery(): CostPerQuery {
    return {
      breakdown: { ...this.costs },
      queryCount: this.queryCount,
      averageCost: this.queryCount > 0 ? this.costs.total / this.queryCount : 0,
    };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.costs = {
      embedding: 0,
      vectorSearch: 0,
      bm25Search: 0,
      reranker: 0,
      total: 0,
    };
    this.queryCount = 0;
  }
}

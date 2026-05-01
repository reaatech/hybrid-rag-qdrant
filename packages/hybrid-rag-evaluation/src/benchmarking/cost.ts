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

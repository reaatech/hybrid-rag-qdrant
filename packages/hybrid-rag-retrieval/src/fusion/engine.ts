/**
 * Fusion orchestration engine
 */

import type { RetrievalResult } from '@reaatech/hybrid-rag';
import { type RerankerConfig, RerankerEngine } from '../reranker.js';
import { applyFusion } from './strategies.js';
import type { FusionConfig } from './strategies.js';

/**
 * Hybrid retrieval configuration
 */
export interface HybridRetrievalConfig {
  /** Fusion configuration */
  fusion: FusionConfig;
  /** Reranker configuration (optional) */
  reranker?: RerankerConfig;
  /** Default top-K results */
  topK?: number;
}

export type { FusionConfig } from './strategies.js';

/**
 * Hybrid retrieval engine
 */
export class HybridRetrievalEngine {
  private readonly fusionConfig: FusionConfig;
  private readonly reranker?: RerankerEngine;
  private readonly topK: number;

  constructor(config: HybridRetrievalConfig) {
    this.fusionConfig = config.fusion;
    this.topK = config.topK ?? 10;

    if (config.reranker) {
      this.reranker = new RerankerEngine(config.reranker);
    }
  }

  /**
   * Fuse vector and BM25 results
   */
  fuse(
    vectorResults: RetrievalResult[],
    bm25Results: RetrievalResult[],
    options?: { topK?: number; vectorWeight?: number; bm25Weight?: number },
  ): RetrievalResult[] {
    const topK = options?.topK ?? this.topK;
    const vectorWeight = options?.vectorWeight ?? this.fusionConfig.vectorWeight ?? 0.7;
    const bm25Weight = options?.bm25Weight ?? this.fusionConfig.bm25Weight ?? 0.3;

    const fusedConfig: FusionConfig = {
      ...this.fusionConfig,
      vectorWeight,
      bm25Weight,
    };

    const fused = applyFusion(vectorResults, bm25Results, fusedConfig);

    return fused.slice(0, topK);
  }

  /**
   * Fuse and optionally rerank results
   */
  async fuseAndRerank(
    vectorResults: RetrievalResult[],
    bm25Results: RetrievalResult[],
    query: string,
    options?: { topK?: number; useReranker?: boolean },
  ): Promise<RetrievalResult[]> {
    const topK = options?.topK ?? this.topK;
    const useReranker = options?.useReranker ?? true;

    // Fuse results
    const fused = this.fuse(vectorResults, bm25Results, { topK: topK * 2 });

    // Optionally rerank
    if (useReranker && this.reranker) {
      const reranked = await this.reranker.rerankResults(query, fused);
      return reranked.slice(0, topK) as RetrievalResult[];
    }

    return fused.slice(0, topK);
  }

  /**
   * Check if reranker is configured
   */
  hasReranker(): boolean {
    return !!this.reranker;
  }

  /**
   * Get reranker engine
   */
  getReranker(): RerankerEngine | undefined {
    return this.reranker;
  }
}

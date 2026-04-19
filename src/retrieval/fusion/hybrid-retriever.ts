/**
 * Hybrid Retriever - coordinates vector and BM25 retrieval with fusion
 */

import type { Chunk, RetrievalResult } from '../../types/domain.js';
import { VectorSearchEngine, type VectorSearchConfig } from '../vector/search.js';
import { BM25SearchEngine, type BM25SearchConfig } from '../bm25/search.js';
import { HybridRetrievalEngine, type HybridRetrievalConfig } from './engine.js';
import type { FusionConfig } from './strategies.js';

/**
 * Hybrid retriever configuration
 */
export interface HybridRetrieverConfig {
  /** Vector search configuration */
  vector: VectorSearchConfig;
  /** BM25 search configuration */
  bm25: BM25SearchConfig;
  /** Fusion strategy */
  fusion: FusionConfig;
  /** Default top-K */
  topK?: number;
}

/**
 * Retrieval options for hybrid search
 */
export interface HybridRetrievalOptions {
  /** Retrieval mode: hybrid, vector, or bm25 */
  retrievalMode?: 'hybrid' | 'vector' | 'bm25';
  /** Vector weight for fusion (default: 0.5) */
  vectorWeight?: number;
  /** BM25 weight for fusion (default: 0.5) */
  bm25Weight?: number;
  /** Top-K results */
  topK?: number;
  /** Filter to apply */
  filter?: Record<string, unknown>;
}

/**
 * Hybrid Retriever - coordinates vector and BM25 retrieval with fusion
 */
export class HybridRetriever {
  private readonly vectorSearch: VectorSearchEngine;
  private readonly bm25Search: BM25SearchEngine;
  private readonly fusionEngine: HybridRetrievalEngine;
  private readonly topK: number;
  private initialized = false;

  constructor(config: HybridRetrieverConfig) {
    this.vectorSearch = new VectorSearchEngine(config.vector);
    this.bm25Search = new BM25SearchEngine(config.bm25);
    this.topK = config.topK ?? 10;

    const fusionConfig: HybridRetrievalConfig = {
      fusion: config.fusion,
      topK: this.topK,
    };
    this.fusionEngine = new HybridRetrievalEngine(fusionConfig);
  }

  /**
   * Initialize the retriever (connect to Qdrant, etc.)
   */
  async initialize(): Promise<void> {
    await this.vectorSearch.initialize();
    this.initialized = true;
  }

  /**
   * Index chunks in both vector and BM25 indexes
   */
  async indexChunks(chunks: Chunk[]): Promise<void> {
    await Promise.all([
      this.vectorSearch.indexChunks(chunks),
      this.bm25Search.indexChunks(chunks),
    ]);
  }

  /**
   * Retrieve results using hybrid, vector-only, or BM25-only search
   */
  async retrieve(query: string, options?: HybridRetrievalOptions): Promise<RetrievalResult[]> {
    const topK = options?.topK ?? this.topK;
    const retrievalMode = options?.retrievalMode ?? 'hybrid';

    if (retrievalMode === 'vector') {
      return this.vectorSearch.search(query, { topK, filter: options?.filter });
    }

    if (retrievalMode === 'bm25') {
      return this.bm25Search.search(query, { topK });
    }

    // Hybrid mode - get results from both and fuse
    const [vectorResults, bm25Results] = await Promise.all([
      this.vectorSearch.search(query, { topK: topK * 2, filter: options?.filter }),
      this.bm25Search.search(query, { topK: topK * 2 }),
    ]);

    return this.fusionEngine.fuse(vectorResults, bm25Results, {
      topK,
      vectorWeight: options?.vectorWeight ?? 0.5,
      bm25Weight: options?.bm25Weight ?? 0.5,
    });
  }

  /**
   * Get retrieval statistics
   */
  async getStats(): Promise<{
    totalChunks: number;
    vectorIndexSize: number;
    bm25Stats: {
      totalDocuments: number;
      totalTerms: number;
      avgDocLength: number;
    };
  }> {
    const bm25Stats = this.bm25Search.getStats?.() ?? { totalDocuments: 0, totalTerms: 0, avgDocLength: 0 };
    return {
      totalChunks: bm25Stats.totalDocuments,
      vectorIndexSize: bm25Stats.totalDocuments,
      bm25Stats,
    };
  }

  /**
   * Close resources
   */
  async close(): Promise<void> {
    // Vector search doesn't have a close method currently
    this.initialized = false;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the fusion engine for advanced use cases
   */
  getFusionEngine(): HybridRetrievalEngine {
    return this.fusionEngine;
  }
}
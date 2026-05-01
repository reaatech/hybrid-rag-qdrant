/**
 * BM25 search operations wrapper
 */

import type { Chunk, RetrievalResult } from '@reaatech/hybrid-rag';
import { type BM25Config, BM25Engine } from './engine.js';

/**
 * BM25 search configuration
 */
export interface BM25SearchConfig extends BM25Config {
  /** Default top-K results */
  topK?: number;
}

/**
 * BM25 search engine wrapper
 */
export class BM25SearchEngine {
  private readonly engine: BM25Engine;
  private readonly topK: number;

  constructor(config: BM25SearchConfig = {}) {
    this.engine = new BM25Engine(config);
    this.topK = config.topK ?? 10;
  }

  /**
   * Index chunks for BM25 search
   */
  async indexChunks(chunks: Chunk[]): Promise<void> {
    const documents = chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      metadata: {
        documentId: chunk.documentId,
        index: chunk.index,
        tokenCount: chunk.tokenCount,
        characterCount: chunk.characterCount,
        startPosition: chunk.startPosition,
        endPosition: chunk.endPosition,
        metadata: chunk.metadata,
        strategy: chunk.strategy,
      },
    }));

    this.engine.addDocuments(documents);
  }

  /**
   * Search for documents matching a query
   */
  async search(query: string, options?: { topK?: number }): Promise<RetrievalResult[]> {
    const topK = options?.topK ?? this.topK;
    const results = this.engine.search(query, topK);

    return results.map((result) => ({
      chunkId: result.chunkId,
      documentId: result.documentId,
      content: result.content,
      score: result.score,
      source: 'bm25' as const,
      metadata: result.metadata,
    }));
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalDocuments: number;
    totalTerms: number;
    avgDocLength: number;
  } {
    return this.engine.getStats();
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.engine.clear();
  }

  /**
   * Get the underlying BM25 engine
   */
  getEngine(): BM25Engine {
    return this.engine;
  }
}

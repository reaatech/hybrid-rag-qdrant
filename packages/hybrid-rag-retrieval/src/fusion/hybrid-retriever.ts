import type {
  Chunk,
  RetrievalResult,
  StandardFilter,
  VectorStoreAdapter,
} from '@reaatech/hybrid-rag';
import { type BM25SearchConfig, BM25SearchEngine } from '../bm25/search.js';
import { type VectorSearchConfig, VectorSearchEngine } from '../vector-search.js';
import { type HybridRetrievalConfig, HybridRetrievalEngine } from './engine.js';
import type { FusionConfig } from './strategies.js';

export interface HybridRetrieverConfig {
  vector: VectorSearchConfig;
  bm25: BM25SearchConfig;
  fusion: FusionConfig;
  topK?: number;
}

export interface HybridRetrievalOptions {
  retrievalMode?: 'hybrid' | 'vector' | 'bm25';
  vectorWeight?: number;
  bm25Weight?: number;
  topK?: number;
  filter?: StandardFilter;
}

export class HybridRetriever {
  private readonly vectorSearch: VectorSearchEngine;
  private readonly bm25Search: BM25SearchEngine;
  private readonly fusionEngine: HybridRetrievalEngine;
  private readonly topK: number;
  private initialized = false;

  constructor(config: HybridRetrieverConfig, adapter?: VectorStoreAdapter) {
    this.vectorSearch = new VectorSearchEngine(config.vector, adapter);
    this.bm25Search = new BM25SearchEngine(config.bm25);
    this.topK = config.topK ?? 10;

    const fusionConfig: HybridRetrievalConfig = {
      fusion: config.fusion,
      topK: this.topK,
    };
    this.fusionEngine = new HybridRetrievalEngine(fusionConfig);
  }

  async initialize(): Promise<void> {
    await this.vectorSearch.initialize();
    this.initialized = true;
  }

  async indexChunks(chunks: Chunk[]): Promise<void> {
    await Promise.all([this.vectorSearch.indexChunks(chunks), this.bm25Search.indexChunks(chunks)]);
  }

  async retrieve(query: string, options?: HybridRetrievalOptions): Promise<RetrievalResult[]> {
    const topK = options?.topK ?? this.topK;
    const retrievalMode = options?.retrievalMode ?? 'hybrid';

    if (retrievalMode === 'vector') {
      return this.vectorSearch.search(query, { topK, filter: options?.filter });
    }

    if (retrievalMode === 'bm25') {
      return this.bm25Search.search(query, { topK });
    }

    const capabilities = this.vectorSearch.getCapabilities();
    if (capabilities.supportsHybridSearch) {
      const queryEmbedding = await this.vectorSearch.embedQuery(query);
      return this.vectorSearch.searchWithHybrid(query, queryEmbedding, {
        topK,
        filter: options?.filter,
        hybridAlpha: options?.vectorWeight,
      });
    }

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

  async getStats(): Promise<{
    totalChunks: number;
    vectorIndexSize: number;
    bm25Stats: {
      totalDocuments: number;
      totalTerms: number;
      avgDocLength: number;
    };
  }> {
    const bm25Stats = this.bm25Search.getStats?.() ?? {
      totalDocuments: 0,
      totalTerms: 0,
      avgDocLength: 0,
    };
    return {
      totalChunks: bm25Stats.totalDocuments,
      vectorIndexSize: bm25Stats.totalDocuments,
      bm25Stats,
    };
  }

  async close(): Promise<void> {
    await this.vectorSearch.close();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getFusionEngine(): HybridRetrievalEngine {
    return this.fusionEngine;
  }

  getVectorSearchEngine(): VectorSearchEngine {
    return this.vectorSearch;
  }
}

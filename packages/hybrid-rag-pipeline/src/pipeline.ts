/**
 * Main RAG Pipeline
 */

import { type Chunk, type ChunkingConfig, ChunkingStrategy } from '@reaatech/hybrid-rag';
import type { RetrievalResult } from '@reaatech/hybrid-rag';
import { chunkDocument } from '@reaatech/hybrid-rag-ingestion';
import {
  type HybridRetrievalOptions,
  HybridRetriever,
  type HybridRetrieverConfig,
} from '@reaatech/hybrid-rag-retrieval';
import { type RerankerConfig, RerankerEngine } from '@reaatech/hybrid-rag-retrieval';

/**
 * RAG Pipeline configuration
 */
export interface RAGPipelineConfig {
  // Qdrant configuration
  qdrantUrl: string;
  qdrantApiKey?: string;
  collectionName?: string;

  // Embedding configuration
  embeddingProvider?: 'openai' | 'vertex' | 'local';
  embeddingModel?: string;
  embeddingApiKey?: string;

  // Chunking configuration
  chunkingStrategy?: ChunkingStrategy;
  chunkSize?: number;
  chunkOverlap?: number;

  // Retrieval configuration
  topK?: number;
  vectorWeight?: number;
  bm25Weight?: number;
  useHybrid?: boolean;

  // Reranker configuration
  rerankerProvider?: 'cohere' | 'jina' | 'openai' | 'local' | null;
  rerankerModel?: string;
  rerankerApiKey?: string;
  rerankTopK?: number;
  rerankFinalK?: number;

  // BM25 configuration
  bm25K1?: number;
  bm25B?: number;

  // Fusion strategy
  fusionStrategy?: 'rrf' | 'weighted-sum' | 'normalized';
}

/**
 * Query options
 */
export interface QueryOptions {
  topK?: number;
  useReranker?: boolean;
  rerankTopK?: number;
  rerankFinalK?: number;
  vectorWeight?: number;
  bm25Weight?: number;
  filter?: Record<string, unknown>;
  retrievalMode?: 'hybrid' | 'vector' | 'bm25';
}

/**
 * Default configuration values
 */
const DEFAULTS: Partial<RAGPipelineConfig> = {
  collectionName: 'documents',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  chunkingStrategy: ChunkingStrategy.FIXED_SIZE,
  chunkSize: 512,
  chunkOverlap: 50,
  topK: 10,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  useHybrid: true,
  rerankerProvider: null,
  rerankTopK: 20,
  rerankFinalK: 10,
  bm25K1: 1.2,
  bm25B: 0.75,
  fusionStrategy: 'rrf',
};

/**
 * Main RAG Pipeline class
 *
 * Provides a unified interface for document ingestion and retrieval
 * using hybrid search (vector + BM25) with optional reranking.
 */
export class RAGPipeline {
  private readonly config: Required<RAGPipelineConfig>;
  private retriever: HybridRetriever | null = null;
  private reranker: RerankerEngine | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: RAGPipelineConfig) {
    this.config = { ...DEFAULTS, ...config } as Required<RAGPipelineConfig>;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    const retrievalConfig: HybridRetrieverConfig = {
      vector: {
        qdrant: {
          url: this.config.qdrantUrl,
          apiKey: this.config.qdrantApiKey,
          collectionName: this.config.collectionName,
        },
        embedding: {
          provider: this.config.embeddingProvider,
          model: this.config.embeddingModel,
          apiKey: this.config.embeddingApiKey,
        },
        topK: this.config.topK,
      },
      bm25: {
        k1: this.config.bm25K1,
        b: this.config.bm25B,
        topK: this.config.topK,
      },
      fusion: {
        strategy: this.config.fusionStrategy,
        vectorWeight: this.config.vectorWeight,
        bm25Weight: this.config.bm25Weight,
      },
      topK: this.config.topK,
    };

    this.retriever = new HybridRetriever(retrievalConfig);
    await this.retriever.initialize();

    // Initialize reranker if configured
    if (this.config.rerankerProvider) {
      const rerankerConfig: RerankerConfig = {
        provider: this.config.rerankerProvider,
        model: this.config.rerankerModel,
        apiKey: this.config.rerankerApiKey,
      };
      this.reranker = new RerankerEngine(rerankerConfig);
    }

    this.initialized = true;
  }

  /**
   * Ingest documents
   */
  async ingest(
    documents: { id: string; content: string; metadata?: Record<string, unknown> }[],
  ): Promise<Chunk[]> {
    await this.initialize();

    const allChunks: Chunk[] = [];

    for (const doc of documents) {
      // Chunk the document
      const chunkingConfig: ChunkingConfig = {
        strategy: this.config.chunkingStrategy,
        chunkSize: this.config.chunkSize,
        overlap: this.config.chunkOverlap,
      };

      const chunks = await chunkDocument(doc.content, doc.id, chunkingConfig, doc.metadata);
      allChunks.push(...chunks);
    }

    // Index chunks in Qdrant and BM25
    if (this.retriever) {
      await this.retriever.indexChunks(allChunks);
    }

    return allChunks;
  }

  /**
   * Query the pipeline
   */
  async query(queryText: string, options?: QueryOptions): Promise<RetrievalResult[]> {
    await this.initialize();

    if (!this.retriever) {
      throw new Error('Pipeline not initialized');
    }

    const topK = options?.topK ?? this.config.topK;
    const useReranker = options?.useReranker ?? this.reranker !== null;
    const rerankTopK = options?.rerankTopK ?? this.config.rerankTopK;
    const rerankFinalK = options?.rerankFinalK ?? this.config.rerankFinalK;

    const retrievalOptions: HybridRetrievalOptions = {
      topK: useReranker ? rerankTopK : topK,
      vectorWeight: options?.vectorWeight ?? this.config.vectorWeight,
      bm25Weight: options?.bm25Weight ?? this.config.bm25Weight,
      filter: options?.filter,
      retrievalMode: options?.retrievalMode ?? 'hybrid',
    };

    let results = await this.retriever.retrieve(queryText, retrievalOptions);

    // Optional reranking
    if (useReranker && this.reranker && results.length > 0) {
      const reranked = await this.reranker.rerankResults(queryText, results);
      results = reranked.slice(0, rerankFinalK) as unknown as RetrievalResult[];
    }

    return results.slice(0, topK);
  }

  /**
   * Get pipeline statistics
   */
  async getStats(): Promise<{
    totalChunks: number;
    totalDocuments: number;
    collectionName: string;
  }> {
    await this.initialize();

    if (!this.retriever) {
      return {
        totalChunks: 0,
        totalDocuments: 0,
        collectionName: this.config.collectionName,
      };
    }

    const stats = await this.retriever.getStats();
    return {
      totalChunks: stats.totalChunks,
      totalDocuments: stats.bm25Stats.totalDocuments,
      collectionName: this.config.collectionName,
    };
  }

  /**
   * Close the pipeline and release resources
   */
  async close(): Promise<void> {
    if (this.retriever) {
      await this.retriever.close();
    }
    this.retriever = null;
    this.reranker = null;
    this.initialized = false;
    this.initPromise = null;
  }
}

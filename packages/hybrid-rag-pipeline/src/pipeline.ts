import {
  ContextPlanner,
  createRAGChunk,
  createStrategy,
  createTokenizer,
  type PackingResult,
} from '@reaatech/context-window-planner';
import type {
  RetrievalResult,
  StandardFilter,
  VectorStoreAdapter,
  VectorStoreCapabilities,
  VectorStoreConfig,
  VectorStoreCostModel,
  VectorStoreProvider,
  VectorStoreStats,
} from '@reaatech/hybrid-rag';
import { type Chunk, type ChunkingConfig, ChunkingStrategy } from '@reaatech/hybrid-rag';
import { EmbeddingService } from '@reaatech/hybrid-rag-embedding';
import { chunkDocument } from '@reaatech/hybrid-rag-ingestion';
import {
  createVectorStore,
  type HybridRetrievalOptions,
  HybridRetriever,
  type HybridRetrieverConfig,
  type RerankerConfig,
  RerankerEngine,
} from '@reaatech/hybrid-rag-retrieval';

export interface VectorStoreReadinessReport {
  provider: VectorStoreProvider;
  healthy: boolean;
  latencyMs?: number;
  issues: Array<{
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    suggestedFix?: string;
  }>;
  capabilities: VectorStoreCapabilities;
  stats?: VectorStoreStats | null;
}

export type VectorStorePreset = 'local' | 'qdrant-dev' | 'postgres' | 'sandbox';

export interface RAGPipelineConfig {
  vectorStore?: VectorStoreConfig;
  vectorStorePreset?: VectorStorePreset;
  vectorStoreProvider?: VectorStoreProvider;
  collectionName?: string;

  embeddingProvider?: 'openai' | 'vertex' | 'local';
  embeddingModel?: string;
  embeddingApiKey?: string;

  chunkingStrategy?: ChunkingStrategy;
  chunkSize?: number;
  chunkOverlap?: number;

  topK?: number;
  vectorWeight?: number;
  bm25Weight?: number;
  useHybrid?: boolean;

  rerankerProvider?: 'cohere' | 'jina' | 'openai' | 'local' | null;
  rerankerModel?: string;
  rerankerApiKey?: string;
  rerankTopK?: number;
  rerankFinalK?: number;

  bm25K1?: number;
  bm25B?: number;

  fusionStrategy?: 'rrf' | 'weighted-sum' | 'normalized';

  contextWindowBudget?: number;
  contextWindowModel?: string;
  contextWindowStrategy?: string;
}

export interface QueryOptions {
  topK?: number;
  useReranker?: boolean;
  rerankTopK?: number;
  rerankFinalK?: number;
  vectorWeight?: number;
  bm25Weight?: number;
  filter?: StandardFilter;
  retrievalMode?: 'hybrid' | 'vector' | 'bm25';
  vectorStore?: VectorStoreConfig;
  vectorStoreProvider?: VectorStoreProvider;
}

interface LegacyRAGPipelineConfig extends RAGPipelineConfig {
  qdrantUrl?: string;
  qdrantApiKey?: string;
}

const DEFAULTS: Partial<RAGPipelineConfig> = {
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

export class RAGPipeline {
  private readonly config: Required<RAGPipelineConfig>;
  private retriever: HybridRetriever | null = null;
  private vectorStore: VectorStoreAdapter | null = null;
  private reranker: RerankerEngine | null = null;
  private contextPlanner: ContextPlanner | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: RAGPipelineConfig) {
    this.config = this.normalizeConfig(config) as Required<RAGPipelineConfig>;
  }

  private normalizeConfig(raw: RAGPipelineConfig): RAGPipelineConfig {
    const config = { ...raw };
    const legacy = raw as LegacyRAGPipelineConfig;
    if (legacy.qdrantUrl && !raw.vectorStore) {
      const dimension = EmbeddingService.getDimension(
        raw.embeddingModel ?? 'text-embedding-3-small',
      );
      config.vectorStore = {
        provider: 'qdrant',
        url: legacy.qdrantUrl,
        apiKey: legacy.qdrantApiKey,
        collectionName: raw.collectionName ?? 'documents',
        vectorSize: dimension,
      } as VectorStoreConfig;
    }
    // Explicit `vectorStore` always wins. Otherwise fall back to a named
    // preset, then finally to the embedded LanceDB default.
    if (!config.vectorStore && config.vectorStorePreset) {
      config.vectorStore = this.resolvePreset(config.vectorStorePreset, config);
    }
    if (!config.vectorStore && !config.vectorStoreProvider) {
      const dimension = EmbeddingService.getDimension(
        config.embeddingModel ?? 'text-embedding-3-small',
      );
      config.vectorStore = {
        provider: 'lancedb',
        uri: '.lancedb-data',
        tableName: 'documents',
        vectorDimension: dimension,
      } as VectorStoreConfig;
    }
    return { ...DEFAULTS, ...config };
  }

  /**
   * Resolve a named vector-store preset into a concrete {@link VectorStoreConfig}.
   * Resolution is deterministic: localhost defaults are used for server-backed
   * presets and the vector dimension is derived from the embedding model.
   */
  private resolvePreset(preset: VectorStorePreset, config: RAGPipelineConfig): VectorStoreConfig {
    const dimension = EmbeddingService.getDimension(
      config.embeddingModel ?? 'text-embedding-3-small',
    );
    const collectionName = config.collectionName ?? 'documents';
    switch (preset) {
      case 'local':
        return {
          provider: 'lancedb',
          uri: '.lancedb-data',
          tableName: collectionName,
          vectorDimension: dimension,
        };
      case 'qdrant-dev':
        return {
          provider: 'qdrant',
          url: 'http://localhost:6333',
          collectionName,
          vectorSize: dimension,
        };
      case 'postgres':
        return {
          provider: 'pgvector',
          connectionString: 'postgres://postgres:postgres@localhost:5432/postgres',
          tableName: collectionName,
          vectorDimension: dimension,
        };
      case 'sandbox':
        return {
          provider: 'sandbox',
          collectionName,
        };
    }
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
    if (!this.config.vectorStore) {
      throw new Error('No vector store configured');
    }
    this.vectorStore = await createVectorStore(this.config.vectorStore);
    await this.vectorStore.initialize();

    const retrievalConfig: HybridRetrieverConfig = {
      vector: {
        vectorStore: this.config.vectorStore!,
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

    this.retriever = new HybridRetriever(retrievalConfig, this.vectorStore);
    await this.retriever.initialize();

    if (this.config.rerankerProvider) {
      const rerankerConfig: RerankerConfig = {
        provider: this.config.rerankerProvider,
        model: this.config.rerankerModel,
        apiKey: this.config.rerankerApiKey,
      };
      this.reranker = new RerankerEngine(rerankerConfig);
    }

    const contextBudget = this.config.contextWindowBudget ?? 128_000;
    const contextModel = this.config.contextWindowModel ?? 'gpt-4';
    const contextStrat = this.config.contextWindowStrategy ?? 'priority-greedy';
    const tokenizer = createTokenizer(contextModel);
    const strategy = createStrategy(contextStrat);
    this.contextPlanner = new ContextPlanner({
      budget: contextBudget,
      tokenizer,
      strategy,
    });

    this.initialized = true;
  }

  async ingest(
    documents: { id: string; content: string; metadata?: Record<string, unknown> }[],
  ): Promise<Chunk[]> {
    await this.initialize();

    const allChunks: Chunk[] = [];

    for (const doc of documents) {
      const chunkingConfig: ChunkingConfig = {
        strategy: this.config.chunkingStrategy,
        chunkSize: this.config.chunkSize,
        overlap: this.config.chunkOverlap,
      };

      const chunks = await chunkDocument(doc.content, doc.id, chunkingConfig, doc.metadata);
      allChunks.push(...chunks);
    }

    if (this.retriever) {
      await this.retriever.indexChunks(allChunks);
    }

    return allChunks;
  }

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

    if (useReranker && this.reranker && results.length > 0) {
      const reranked = await this.reranker.rerankResults(queryText, results);
      results = reranked.slice(0, rerankFinalK) as RetrievalResult[];
    }

    return results.slice(0, topK);
  }

  async buildContextWindow(
    results: RetrievalResult[],
    _systemPrompt?: string,
  ): Promise<PackingResult> {
    await this.initialize();

    if (!this.contextPlanner) {
      throw new Error('Context planner not initialized');
    }

    this.contextPlanner.clear();

    for (const [i, result] of results.entries()) {
      const ragChunk = createRAGChunk(
        {
          content: result.content ?? '',
          relevanceScore: result.score,
          source: result.documentId,
          chunkIndex: i,
          id: result.chunkId,
        },
        createTokenizer(this.config.contextWindowModel ?? 'gpt-4'),
      );
      this.contextPlanner.add(ragChunk);
    }

    return this.contextPlanner.pack();
  }

  async getStats(): Promise<{
    totalChunks: number;
    totalDocuments: number;
    collectionName: string;
    vectorStores: VectorStoreStats[];
  }> {
    await this.initialize();

    if (!this.retriever) {
      return {
        totalChunks: 0,
        totalDocuments: 0,
        collectionName: 'unknown',
        vectorStores: [],
      };
    }

    const stats = await this.retriever.getStats();

    let vectorStores: VectorStoreStats[] = [];
    if (this.vectorStore) {
      try {
        const collections = await this.vectorStore.listCollections();
        const statsPromises = collections.map((name) =>
          this.vectorStore!.getCollectionInfo(name).catch(() => null),
        );
        const results = await Promise.all(statsPromises);
        vectorStores = results.filter((s): s is VectorStoreStats => s !== null);
      } catch {
        try {
          const info = await this.vectorStore.getCollectionInfo(this.getCollectionName());
          if (info) vectorStores = [info];
        } catch {
          // ignore
        }
      }
    }

    return {
      totalChunks: stats.totalChunks,
      totalDocuments: stats.bm25Stats.totalDocuments,
      collectionName: this.getCollectionName(),
      vectorStores,
    };
  }

  async getVectorStoreCapabilities(): Promise<VectorStoreCapabilities | null> {
    await this.initialize();
    return this.vectorStore?.capabilities ?? null;
  }

  async getVectorStoreHealth(): Promise<boolean> {
    await this.initialize();
    if (!this.vectorStore) return false;
    return this.vectorStore.healthCheck();
  }

  async getVectorStoreReadiness(): Promise<VectorStoreReadinessReport> {
    await this.initialize();
    const provider = this.vectorStore!.provider;
    const capabilities = this.vectorStore!.capabilities;
    const issues: VectorStoreReadinessReport['issues'] = [];

    const start = performance.now();
    let healthy: boolean;
    try {
      healthy = await this.vectorStore!.healthCheck();
    } catch {
      healthy = false;
    }
    const latencyMs = performance.now() - start;

    if (!healthy) {
      issues.push({
        code: 'HEALTH_CHECK_FAILED',
        message: `Vector store provider '${provider}' health check failed`,
        severity: 'error',
        suggestedFix: 'Verify the vector database is running and accessible',
      });
    }

    let stats: VectorStoreStats | null = null;
    try {
      stats = await this.vectorStore!.getCollectionInfo(this.getCollectionName());
    } catch {
      // collection may not exist yet
    }

    return { provider, healthy, latencyMs, issues, capabilities, stats };
  }

  getVectorStoreCostModel(): VectorStoreCostModel | null {
    return this.vectorStore?.costModel ?? null;
  }

  private getCollectionNameFromConfig(vs: VectorStoreConfig): string {
    if ('collectionName' in vs && typeof vs.collectionName === 'string') return vs.collectionName;
    if ('indexName' in vs && typeof vs.indexName === 'string') return vs.indexName;
    if ('tableName' in vs && typeof vs.tableName === 'string') return vs.tableName;
    if ('className' in vs && typeof vs.className === 'string') return vs.className;
    return 'documents';
  }

  private getCollectionName(): string {
    const vs = this.config.vectorStore;
    if (!vs) return 'documents';
    return this.getCollectionNameFromConfig(vs);
  }

  async getVectorStoreStats(): Promise<VectorStoreStats | null> {
    await this.initialize();
    const stats = await this.getStats();
    return stats.vectorStores[0] ?? null;
  }

  async close(): Promise<void> {
    if (this.retriever) {
      await this.retriever.close();
    }
    if (this.vectorStore && !this.retriever) {
      await this.vectorStore.close();
    }
    this.retriever = null;
    this.vectorStore = null;
    this.reranker = null;
    this.contextPlanner = null;
    this.initialized = false;
    this.initPromise = null;
  }
}

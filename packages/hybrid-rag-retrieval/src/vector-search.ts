import type {
  Chunk,
  RetrievalResult,
  StandardFilter,
  VectorStoreAdapter,
  VectorStoreCapabilities,
  VectorStoreConfig,
  VectorStorePoint,
} from '@reaatech/hybrid-rag';
import { encodeSparse } from '@reaatech/hybrid-rag';
import { type EmbeddingConfig, EmbeddingService } from '@reaatech/hybrid-rag-embedding';
import { createVectorStore } from './vector-store-factory.js';

export interface VectorSearchConfig {
  vectorStore: VectorStoreConfig;
  embedding: EmbeddingConfig;
  topK?: number;
}

export class VectorSearchEngine {
  private readonly embedding: EmbeddingService;
  private readonly topK: number;
  private readonly config: VectorSearchConfig;
  private vectorStore: VectorStoreAdapter | null = null;

  constructor(config: VectorSearchConfig, adapter?: VectorStoreAdapter) {
    this.config = config;
    this.topK = config.topK ?? 10;
    this.embedding = new EmbeddingService({
      ...config.embedding,
      dimension: EmbeddingService.getDimension(config.embedding.model),
    });
    this.vectorStore = adapter ?? null;
  }

  async initialize(): Promise<void> {
    if (!this.vectorStore) {
      this.vectorStore = await createVectorStore(this.config.vectorStore);
    }
    await this.vectorStore.initialize();
  }

  private ensureInitialized(): void {
    if (!this.vectorStore) {
      throw new Error('VectorSearchEngine not initialized. Call initialize() first.');
    }
  }

  getCapabilities(): VectorStoreCapabilities {
    this.ensureInitialized();
    return this.vectorStore!.capabilities;
  }

  getVectorStore(): VectorStoreAdapter {
    this.ensureInitialized();
    return this.vectorStore!;
  }

  async indexChunks(chunks: Chunk[]): Promise<void> {
    this.ensureInitialized();
    const texts = chunks.map((c) => c.content);
    const embeddingResults = await this.embedding.embedBatch(texts);
    const includeSparseVectors = this.vectorStore!.capabilities.supportsHybridSearch;

    const points: VectorStorePoint[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const embeddingResult = embeddingResults[i];
      const vector = embeddingResult?.embedding;

      if (!vector || vector.length === 0) {
        throw new Error(`Failed to generate embedding for chunk ${chunk.id}`);
      }

      points.push({
        id: chunk.id,
        vector,
        payload: {
          documentId: chunk.documentId,
          content: chunk.content,
          index: chunk.index,
          tokenCount: chunk.tokenCount,
          characterCount: chunk.characterCount,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          metadata: chunk.metadata,
          strategy: chunk.strategy,
        },
        sparseVector: includeSparseVectors ? encodeSparse(chunk.content) : undefined,
      });
    }

    await this.vectorStore!.upsertBatch(points);
  }

  async embedQuery(query: string): Promise<number[]> {
    const embeddingResult = await this.embedding.embed(query);
    return embeddingResult.embedding;
  }

  async search(
    query: string,
    options?: { topK?: number; filter?: StandardFilter },
  ): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const topK = options?.topK ?? this.topK;

    const embeddingResult = await this.embedding.embed(query);

    return this.vectorStore!.search({
      vector: embeddingResult.embedding,
      topK,
      filter: options?.filter,
    });
  }

  async searchByVector(
    vector: number[],
    options?: { topK?: number; filter?: StandardFilter },
  ): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const topK = options?.topK ?? this.topK;

    return this.vectorStore!.search({
      vector,
      topK,
      filter: options?.filter,
    });
  }

  async searchWithHybrid(
    query: string,
    vector: number[],
    options?: { topK?: number; filter?: StandardFilter; hybridAlpha?: number },
  ): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    return this.vectorStore!.search({
      vector,
      topK: options?.topK ?? this.topK,
      filter: options?.filter,
      hybridQuery: query,
      hybridAlpha: options?.hybridAlpha,
    });
  }

  async healthCheck(): Promise<boolean> {
    this.ensureInitialized();
    return this.vectorStore!.healthCheck();
  }

  async close(): Promise<void> {
    if (this.vectorStore) {
      await this.vectorStore.close();
    }
    this.vectorStore = null;
  }
}

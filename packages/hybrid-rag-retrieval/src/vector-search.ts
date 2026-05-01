/**
 * Vector search operations
 */

import type { Chunk, RetrievalResult } from '@reaatech/hybrid-rag';
import { type EmbeddingConfig, EmbeddingService } from '@reaatech/hybrid-rag-embedding';
import { QdrantClientWrapper, type QdrantPoint } from '@reaatech/hybrid-rag-qdrant';

/**
 * Vector search configuration
 */
export interface VectorSearchConfig {
  /** Qdrant connection config */
  qdrant: {
    url: string;
    apiKey?: string;
    collectionName: string;
  };
  /** Embedding config */
  embedding: EmbeddingConfig;
  /** Default top-K */
  topK?: number;
  /** Distance metric */
  distance?: 'Cosine' | 'Euclid' | 'Dot';
}

/**
 * Vector search engine
 */
export class VectorSearchEngine {
  private readonly qdrant: QdrantClientWrapper;
  private readonly embedding: EmbeddingService;
  private readonly topK: number;

  constructor(config: VectorSearchConfig) {
    const dimension = EmbeddingService.getDimension(config.embedding.model);

    this.qdrant = new QdrantClientWrapper({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
      collectionName: config.qdrant.collectionName,
      vectorSize: dimension,
      distance: config.distance ?? 'Cosine',
    });

    this.embedding = new EmbeddingService({
      ...config.embedding,
      dimension,
    });

    this.topK = config.topK ?? 10;
  }

  /**
   * Initialize the search engine
   */
  async initialize(): Promise<void> {
    await this.qdrant.initialize();
  }

  /**
   * Index chunks with embeddings
   */
  async indexChunks(chunks: Chunk[]): Promise<void> {
    // Generate embeddings for all chunks
    const texts = chunks.map((c) => c.content);
    const embeddingResults = await this.embedding.embedBatch(texts);

    const points: QdrantPoint[] = [];
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
      });
    }

    // Upsert to Qdrant
    await this.qdrant.upsertBatch(points);
  }

  /**
   * Search for similar documents
   */
  async search(
    query: string,
    options?: { topK?: number; filter?: Record<string, unknown> },
  ): Promise<RetrievalResult[]> {
    const topK = options?.topK ?? this.topK;

    // Generate query embedding
    const embeddingResult = await this.embedding.embed(query);

    // Search in Qdrant
    const results = await this.qdrant.search({
      vector: embeddingResult.embedding,
      topK,
      filter: options?.filter,
    });

    return results;
  }

  /**
   * Search with pre-computed embedding
   */
  async searchByVector(
    vector: number[],
    options?: { topK?: number; filter?: Record<string, unknown> },
  ): Promise<RetrievalResult[]> {
    const topK = options?.topK ?? this.topK;

    return this.qdrant.search({
      vector,
      topK,
      filter: options?.filter,
    });
  }

  /**
   * Get health status
   */
  async healthCheck(): Promise<boolean> {
    return this.qdrant.healthCheck();
  }

  /**
   * Get embedding service for external use
   */
  getEmbeddingService(): EmbeddingService {
    return this.embedding;
  }
}

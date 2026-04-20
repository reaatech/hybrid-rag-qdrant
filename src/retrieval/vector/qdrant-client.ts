/**
 * Qdrant vector database client wrapper
 */

import { QdrantClient, type Schemas } from '@qdrant/js-client-rest';
import type { VectorQuery, RetrievalResult } from '../../types/domain.js';

/**
 * Qdrant client configuration
 */
export interface QdrantClientConfig {
  /** Qdrant server URL */
  url: string;
  /** API key for authentication */
  apiKey?: string;
  /** Default collection name */
  collectionName: string;
  /** Vector dimension */
  vectorSize: number;
  /** Distance metric (default: 'Cosine') */
  distance?: 'Cosine' | 'Euclid' | 'Dot';
}

/**
 * Point structure for Qdrant
 */
export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

/**
 * Qdrant client wrapper for vector operations
 */
export class QdrantClientWrapper {
  private readonly client: QdrantClient;
  private readonly config: QdrantClientConfig;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: QdrantClientConfig) {
    this.config = config;
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });
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
    const exists = await this.collectionExists(this.config.collectionName);
    if (!exists) {
      await this.createCollection(this.config.collectionName, {
        size: this.config.vectorSize,
        distance: this.config.distance ?? 'Cosine',
      });
    }

    this.initialized = true;
  }

  /**
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.some((c) => c.name === collectionName);
    } catch {
      return false;
    }
  }

  /**
   * Create a new collection
   */
  async createCollection(
    collectionName: string,
    vectorParams: { size: number; distance: string },
  ): Promise<void> {
    await this.client.createCollection(collectionName, {
      vectors: {
        size: vectorParams.size,
        distance: vectorParams.distance as Schemas['Distance'],
      },
    });
  }

  /**
   * Upsert a single point
   */
  async upsertPoint(point: QdrantPoint): Promise<void> {
    await this.client.upsert(this.config.collectionName, {
      points: [
        {
          id: point.id,
          vector: point.vector,
          payload: point.payload,
        },
      ],
    });
  }

  /**
   * Upsert multiple points in batch
   */
  async upsertBatch(points: QdrantPoint[]): Promise<void> {
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.client.upsert(this.config.collectionName, {
        points: batch.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      });
    }
  }

  /**
   * Search for similar vectors
   */
  async search(query: VectorQuery): Promise<RetrievalResult[]> {
    const results = await this.client.search(this.config.collectionName, {
      vector: query.vector,
      limit: query.topK,
      with_payload: true,
      filter: query.filter ? this.buildFilter(query.filter) : undefined,
    });

    return results.map((result) => ({
      chunkId: result.id as string,
      documentId: (result.payload?.documentId as string) ?? '',
      content: (result.payload?.content as string) ?? '',
      score: result.score,
      source: 'vector',
      metadata: (result.payload as Record<string, unknown>) ?? {},
    }));
  }

  /**
   * Build Qdrant filter from metadata filter
   */
  private buildFilter(filter: Record<string, unknown>): Schemas['Filter'] {
    const conditions: Schemas['Condition'][] = [];

    for (const [key, value] of Object.entries(filter)) {
      conditions.push({
        key,
        match: { value },
      });
    }

    return { must: conditions };
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionName: string): Promise<void> {
    await this.client.deleteCollection(collectionName);
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(collectionName: string): Promise<Schemas['CollectionInfo'] | null> {
    try {
      return await this.client.getCollection(collectionName);
    } catch {
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }
}

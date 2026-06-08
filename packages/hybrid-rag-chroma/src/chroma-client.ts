import type {
  RetrievalResult,
  StandardFilter,
  StandardFilterOperator,
  VectorStoreAdapter,
  VectorStoreCapabilities,
  VectorStoreCostModel,
  VectorStorePoint,
  VectorStoreSearchOptions,
  VectorStoreStats,
} from '@reaatech/hybrid-rag';
import type { Collection, EmbeddingFunction, Metadata, Where } from 'chromadb';
import { ChromaClient as ChromaClientLib } from 'chromadb';

export interface ChromaClientConfig {
  url?: string;
  collectionName: string;
  tenant?: string;
}

export class ChromaClientWrapper implements VectorStoreAdapter {
  readonly provider = 'chroma' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: false,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: true,
    supportsQuantization: false,
    supportsScan: true,
    maxBatchSize: 5461,
    maxVectorDimension: 20000,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: ChromaClientConfig;
  private client: ChromaClientLib | null = null;
  private collection: Collection | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: ChromaClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    this.client = new ChromaClientLib({
      path: this.config.url ?? 'http://localhost:8000',
    });

    this.collection = await this.client.getOrCreateCollection({
      name: this.config.collectionName,
      embeddingFunction: null as unknown as EmbeddingFunction,
    });

    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const queryOptions: {
      queryEmbeddings: number[][];
      nResults: number;
      where?: Where;
    } = {
      queryEmbeddings: [options.vector],
      nResults: options.topK,
    };

    if (options.filter) {
      queryOptions.where = this.buildChromaFilter(options.filter) as Where;
    }

    const results = await this.collection!.query(queryOptions);

    const ids = (results.ids ?? [])[0] ?? [];
    const distances = (results.distances ?? [])[0] ?? [];
    const metadatas = (results.metadatas ?? [])[0] ?? [];
    const documents = (results.documents ?? [])[0] ?? [];

    return ids.map((id: string, i: number) => ({
      chunkId: id,
      documentId: ((metadatas[i] as Record<string, unknown>)?.documentId as string) ?? '',
      content: (documents[i] as string) ?? '',
      score: 1 - ((distances[i] as number) ?? 0),
      source: 'vector' as const,
      metadata: (metadatas[i] as Record<string, unknown>) ?? {},
    }));
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    await this.upsertBatch([point]);
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const batchSize = this.capabilities.maxBatchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.collection!.upsert({
        ids: batch.map((p) => p.id),
        embeddings: batch.map((p) => p.vector),
        metadatas: batch.map((p) => p.payload as Metadata),
        documents: batch.map((p) => (p.payload?.content as string) ?? ''),
      });
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    await this.client!.deleteCollection({ name: collectionName });
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const col = await this.client!.getCollection({ name: collectionName });
      const count = await col.count();
      return {
        collectionName,
        vectorCount: count,
        vectorDimension: 0,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const collections = await this.client!.listCollections();
      return collections.map((c: { name: string } | string) =>
        typeof c === 'string' ? c : c.name,
      );
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client!.heartbeat();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {}

  async scanPoints(
    _collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const limit = options?.batchSize ?? 100;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const results = await this.collection!.get({
      limit,
      offset,
    });

    const points: VectorStorePoint[] = (results.ids ?? []).map((id: string, i: number) => ({
      id,
      vector: (results.embeddings?.[i] as number[]) ?? [],
      payload: (results.metadatas?.[i] as Record<string, unknown>) ?? {},
    }));

    const nextOffset = offset + points.length;
    const total = await this.collection!.count();
    const nextCursor = nextOffset < total ? String(nextOffset) : undefined;

    return { points, nextCursor };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.collection) {
      throw new Error('ChromaClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildChromaFilter(filter: StandardFilter): Record<string, unknown> {
    if ('$and' in filter && filter.$and) {
      const filters = filter.$and as StandardFilter[];
      return { $and: filters.map((f) => this.buildChromaFilter(f)) };
    }
    if ('$or' in filter && filter.$or) {
      const filters = filter.$or as StandardFilter[];
      return { $or: filters.map((f) => this.buildChromaFilter(f)) };
    }

    const where: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filter)) {
      if (value === null || value === undefined) {
        where[key] = { $eq: null };
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) where[key] = op.$eq;
        else if ('$ne' in op) where[key] = { $ne: op.$ne };
        else if ('$in' in op) where[key] = { $in: op.$in };
        else if ('$nin' in op) where[key] = { $nin: op.$nin };
        else if ('$gt' in op) where[key] = { $gt: op.$gt };
        else if ('$gte' in op) where[key] = { $gte: op.$gte };
        else if ('$lt' in op) where[key] = { $lt: op.$lt };
        else if ('$lte' in op) where[key] = { $lte: op.$lte };
        else if ('$exists' in op) {
          if (op.$exists) where[key] = { $ne: null };
          else where[key] = null;
        }
      } else {
        where[key] = value;
      }
    }
    return where;
  }
}

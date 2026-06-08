import type {
  Index,
  PineconeRecord,
  QueryOptions,
  RecordMetadata,
} from '@pinecone-database/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
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
import { encodeSparse } from '@reaatech/hybrid-rag';

export interface PineconeClientConfig {
  apiKey: string;
  indexName: string;
  cloud?: string;
  region?: string;
  namespace?: string;
}

export class PineconeClientWrapper implements VectorStoreAdapter {
  readonly provider = 'pinecone' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: true,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: false,
    supportsMultiTenancy: true,
    supportsQuantization: false,
    supportsScan: false,
    maxBatchSize: 100,
    maxVectorDimension: 20000,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0.00001,
    costPer1000Upserts: 0.01,
    monthlyBaseCost: 70,
  };

  private readonly config: PineconeClientConfig;
  private client: Pinecone | null = null;
  private index: Index | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: PineconeClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    this.client = new Pinecone({ apiKey: this.config.apiKey });
    const description = await this.client.describeIndex(this.config.indexName);
    if (!description) {
      throw new Error(
        `Pinecone index "${this.config.indexName}" not found. Create it first via the Pinecone console or API.`,
      );
    }
    this.index = this.client.index(this.config.indexName);
    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();

    const queryOptions: QueryOptions & { vector: number[] } = {
      vector: options.vector,
      topK: options.topK,
      includeMetadata: true,
    };

    if (options.hybridQuery) {
      const sparse = encodeSparse(options.hybridQuery);
      queryOptions.sparseVector = {
        indices: sparse.indices,
        values: sparse.values,
      };
    }

    if (options.filter) {
      queryOptions.filter = this.buildStandardFilter(options.filter);
    }

    if (this.config.namespace) {
      queryOptions.namespace = this.config.namespace;
    }

    const results = await this.index!.query(queryOptions);

    return (results.matches ?? []).map((match) => ({
      chunkId: match.id,
      documentId: (match.metadata?.documentId as string) ?? '',
      content: (match.metadata?.content as string) ?? '',
      score: match.score ?? 0,
      source: options.hybridQuery ? ('hybrid-native' as const) : ('vector' as const),
      metadata: (match.metadata as Record<string, unknown>) ?? {},
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
      const records: PineconeRecord[] = batch.map((p) => {
        const content = p.payload?.content;
        const sparseVector =
          p.sparseVector ??
          (typeof content === 'string' && content.trim().length > 0
            ? encodeSparse(content)
            : undefined);
        const record: PineconeRecord = {
          id: p.id,
          values: p.vector,
          metadata: p.payload as unknown as RecordMetadata,
        };
        if (sparseVector && sparseVector.indices.length > 0) {
          record.sparseValues = {
            indices: sparseVector.indices,
            values: sparseVector.values,
          };
        }
        return record;
      });
      await this.index!.upsert({ records });
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    throw new Error(
      `Pinecone does not support collection management via the adapter. Delete index "${collectionName}" via the Pinecone console or API.`,
    );
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    this.ensureInitialized();
    try {
      const stats = await this.index!.describeIndexStats();
      return {
        collectionName,
        vectorCount: stats.totalRecordCount ?? 0,
        vectorDimension: this.vectorDimensionFromStats(stats),
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    this.ensureInitialized();
    try {
      const indexes = await this.client!.listIndexes();
      return (indexes.indexes ?? []).map((i) => i.name);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.index!.describeIndexStats();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {}

  private ensureInitialized(): void {
    if (!this.initialized || !this.index) {
      throw new Error('PineconeClientWrapper not initialized. Call initialize() first.');
    }
  }

  private vectorDimensionFromStats(stats: {
    dimension?: number;
    namespaces?: Record<string, Record<string, unknown>>;
    totalRecordCount?: number;
  }): number {
    const dim = stats.dimension;
    if (typeof dim === 'number') return dim;
    const nm = stats.namespaces;
    if (nm && typeof nm === 'object') {
      const entries = Object.values(nm as Record<string, unknown>);
      if (entries.length > 0) {
        const first = entries[0] as Record<string, unknown> | undefined;
        if (first && typeof first.dimension === 'number') return first.dimension;
      }
    }
    return 0;
  }

  private buildStandardFilter(filter: StandardFilter): Record<string, unknown> {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        return { $and: (filter.$and as StandardFilter[]).map((f) => this.buildStandardFilter(f)) };
      }
      if ('$or' in filter) {
        return { $or: (filter.$or as StandardFilter[]).map((f) => this.buildStandardFilter(f)) };
      }
    }
    const pineconeFilter: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filter)) {
      if (value === null || value === undefined) {
        pineconeFilter[key] = { $eq: null };
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) pineconeFilter[key] = { $eq: op.$eq };
        else if ('$ne' in op) pineconeFilter[key] = { $ne: op.$ne };
        else if ('$in' in op) pineconeFilter[key] = { $in: op.$in };
        else if ('$nin' in op) pineconeFilter[key] = { $nin: op.$nin };
        else if ('$gt' in op) pineconeFilter[key] = { $gt: op.$gt };
        else if ('$gte' in op) pineconeFilter[key] = { $gte: op.$gte };
        else if ('$lt' in op) pineconeFilter[key] = { $lt: op.$lt };
        else if ('$lte' in op) pineconeFilter[key] = { $lte: op.$lte };
        else if ('$exists' in op) pineconeFilter[key] = { $exists: op.$exists };
      } else {
        pineconeFilter[key] = value;
      }
    }
    return pineconeFilter;
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

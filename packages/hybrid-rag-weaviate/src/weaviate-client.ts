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
import weaviate, {
  type FilterValue,
  type WeaviateClient,
  type WeaviateField,
} from 'weaviate-client';

export interface WeaviateClientConfig {
  url: string;
  apiKey?: string;
  className: string;
  tenant?: string;
}

interface WeaviateSearchObject {
  uuid?: string;
  id?: string;
  properties?: Record<string, unknown>;
  metadata?: { distance?: number };
  vector?: number[];
}

interface WeaviateFilterProperty {
  equal(value: unknown): FilterValue;
  notEqual(value: unknown): FilterValue;
  containsAny(values: (string | number)[]): FilterValue;
  containsNone(values: (string | number)[]): FilterValue;
  greaterThan(value: number): FilterValue;
  greaterOrEqual(value: number): FilterValue;
  lessThan(value: number): FilterValue;
  lessOrEqual(value: number): FilterValue;
  isNull(value: boolean): FilterValue;
}

interface WeaviateFilterBuilder {
  and(...filters: FilterValue[]): FilterValue;
  or(...filters: FilterValue[]): FilterValue;
  byProperty(name: string): WeaviateFilterProperty;
}

export class WeaviateClientWrapper implements VectorStoreAdapter {
  readonly provider = 'weaviate' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: true,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: true,
    supportsQuantization: false,
    supportsScan: true,
    maxBatchSize: 100,
    maxVectorDimension: 65535,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: WeaviateClientConfig;
  private client: WeaviateClient | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: WeaviateClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    const url = new URL(this.config.url);
    if (this.config.apiKey) {
      this.client = await weaviate.connectToWeaviateCloud(url.toString(), {
        authCredentials: new weaviate.ApiKey(this.config.apiKey),
      });
    } else {
      this.client = await weaviate.connectToLocal({
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 8080,
      });
    }

    try {
      await this.client.collections.create({
        name: this.config.className,
        vectorizers: [weaviate.configure.vectorizer.none()],
        multiTenancy: this.config.tenant
          ? weaviate.configure.multiTenancy({ enabled: true })
          : undefined,
      });
    } catch {
      // Collection likely already exists — proceed
    }
    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const collection = this.client!.collections.get(this.config.className);

    if (options.hybridQuery) {
      const results = await collection.query.hybrid(options.hybridQuery, {
        vector: options.vector,
        alpha: options.hybridAlpha ?? 0.5,
        limit: options.topK,
        returnMetadata: ['distance'],
        filters: options.filter ? this.buildWeaviateFilter(options.filter) : undefined,
      });

      return (results.objects ?? []).map((obj: WeaviateSearchObject) => ({
        chunkId: obj.uuid ?? obj.id ?? '',
        documentId: (obj.properties?.documentId as string) ?? '',
        content: (obj.properties?.content as string) ?? '',
        score: (obj.metadata?.distance ?? 0) as number,
        source: 'hybrid-native' as const,
        metadata: (obj.properties as Record<string, unknown>) ?? {},
      }));
    }

    const results = await collection.query.nearVector(options.vector, {
      limit: options.topK,
      returnMetadata: ['distance'],
      filters: options.filter ? this.buildWeaviateFilter(options.filter) : undefined,
    });

    return (results.objects ?? []).map((obj: WeaviateSearchObject) => ({
      chunkId: obj.uuid ?? obj.id ?? '',
      documentId: (obj.properties?.documentId as string) ?? '',
      content: (obj.properties?.content as string) ?? '',
      score: (obj.metadata?.distance ?? 0) as number,
      source: 'vector' as const,
      metadata: (obj.properties as Record<string, unknown>) ?? {},
    }));
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    await this.upsertBatch([point]);
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const collection = this.client!.collections.get(this.config.className);
    const objects = points.map((p) => ({
      id: p.id,
      vector: p.vector,
      properties: p.payload as Record<string, WeaviateField>,
    }));
    await collection.data.insertMany(objects);
  }

  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    await this.client!.collections.delete(collectionName);
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const meta = await this.client!.collections.get(collectionName);
      const agg = await meta.aggregate.overAll();
      return {
        collectionName,
        vectorCount: agg.totalCount ?? 0,
        vectorDimension: 0,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const collections = await this.client!.collections.listAll();
      return collections.map((c) => c.name);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client!.getMeta();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  async scanPoints(
    _collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const collection = this.client!.collections.get(this.config.className);
    const batchSize = options?.batchSize ?? 100;
    const query = collection.query.bm25('', {
      limit: batchSize,
      after: options?.cursor,
    } as Record<string, unknown>);

    const result = await query;
    const batch: VectorStorePoint[] = (result.objects ?? []).map((obj: WeaviateSearchObject) => ({
      id: obj.uuid ?? obj.id ?? '',
      vector: obj.vector ?? [],
      payload: (obj.properties as Record<string, unknown>) ?? {},
    }));

    const lastObj = result.objects?.[result.objects.length - 1] as WeaviateSearchObject | undefined;
    const nextCursor =
      batch.length === batchSize && result.objects?.length
        ? (lastObj?.uuid ?? lastObj?.id)
        : undefined;

    return { points: batch, nextCursor };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('WeaviateClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildWeaviateFilter(filter: StandardFilter): FilterValue {
    const wFilters = (weaviate as unknown as { Filters: WeaviateFilterBuilder }).Filters;
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        const filters = (filter.$and as StandardFilter[]).map((f) => this.buildWeaviateFilter(f));
        return wFilters.and(...filters);
      }
      if ('$or' in filter) {
        const filters = (filter.$or as StandardFilter[]).map((f) => this.buildWeaviateFilter(f));
        return wFilters.or(...filters);
      }
    }

    const conditions: FilterValue[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (value === null || value === undefined) {
        conditions.push(wFilters.byProperty(key).isNull(true));
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) conditions.push(wFilters.byProperty(key).equal(op.$eq));
        else if ('$ne' in op) conditions.push(wFilters.byProperty(key).notEqual(op.$ne));
        else if ('$in' in op) {
          const arr = op.$in as (string | number)[];
          if (arr.length > 0) {
            conditions.push(wFilters.byProperty(key).containsAny(arr));
          }
        } else if ('$nin' in op) {
          const arr = op.$nin as (string | number)[];
          if (arr.length > 0) {
            conditions.push(wFilters.byProperty(key).containsNone(arr));
          }
        } else if ('$gt' in op)
          conditions.push(wFilters.byProperty(key).greaterThan(op.$gt as number));
        else if ('$gte' in op)
          conditions.push(wFilters.byProperty(key).greaterOrEqual(op.$gte as number));
        else if ('$lt' in op) conditions.push(wFilters.byProperty(key).lessThan(op.$lt as number));
        else if ('$lte' in op)
          conditions.push(wFilters.byProperty(key).lessOrEqual(op.$lte as number));
        else if ('$exists' in op) conditions.push(wFilters.byProperty(key).isNull(!op.$exists));
      } else {
        conditions.push(wFilters.byProperty(key).equal(value));
      }
    }

    if (conditions.length === 1) return conditions[0];
    return wFilters.and(...conditions);
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

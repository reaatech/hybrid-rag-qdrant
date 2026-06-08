import { QdrantClient, type Schemas } from '@qdrant/js-client-rest';
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

export interface QdrantClientConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
  distance?: 'Cosine' | 'Euclid' | 'Dot';
}

export class QdrantClientWrapper implements VectorStoreAdapter {
  readonly provider = 'qdrant';
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: false,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: false,
    supportsQuantization: false,
    supportsScan: true,
    maxBatchSize: 100,
    maxVectorDimension: 65535,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly client: QdrantClient;
  private readonly config: QdrantClientConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: QdrantClientConfig) {
    this.config = config;
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
      // Skip the client-server version probe fired on construction. Without it the
      // client emits an async "Failed to obtain server version" warning that can
      // resolve during test-worker teardown (unhandled rejection). The adapter
      // manages its own initialization lifecycle, so this check is unnecessary.
      checkCompatibility: false,
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

  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.some((c) => c.name === collectionName);
    } catch {
      return false;
    }
  }

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

  async upsertPoint(point: VectorStorePoint): Promise<void> {
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

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
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

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    const results = await this.client.search(this.config.collectionName, {
      vector: options.vector,
      limit: options.topK,
      with_payload: true,
      filter: options.filter ? this.buildStandardFilter(options.filter) : undefined,
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

  buildStandardFilter(filter: StandardFilter): Schemas['Filter'] {
    if ('$and' in filter && Array.isArray(filter.$and)) {
      const allMust: Schemas['Condition'][] = [];
      const allMustNot: Schemas['Condition'][] = [];
      for (const sub of filter.$and as StandardFilter[]) {
        const sf = this.buildStandardFilter(sub);
        const sfMust = sf.must;
        const sfMustNot = sf.must_not;
        if (Array.isArray(sfMust)) allMust.push(...sfMust);
        else if (sfMust) allMust.push(sfMust);
        if (Array.isArray(sfMustNot)) allMustNot.push(...sfMustNot);
        else if (sfMustNot) allMustNot.push(sfMustNot);
      }
      const result: Schemas['Filter'] = {};
      if (allMust.length > 0) result.must = allMust;
      if (allMustNot.length > 0) result.must_not = allMustNot;
      return result;
    }

    if ('$or' in filter && Array.isArray(filter.$or)) {
      const should = (filter.$or as StandardFilter[]).map((sub) => ({
        filter: this.buildStandardFilter(sub),
      }));
      return { should } as Schemas['Filter'];
    }

    const must: Schemas['Condition'][] = [];
    const mustNot: Schemas['Condition'][] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;

        if ('$eq' in op) {
          must.push({ key, match: { value: op.$eq } });
        } else if ('$ne' in op) {
          mustNot.push({ key, match: { value: op.$ne } });
        } else if ('$in' in op) {
          const vals = op.$in;
          must.push({ key, match: { any: vals } });
        } else if ('$nin' in op) {
          const vals = op.$nin;
          mustNot.push({ key, match: { any: vals } });
        } else if ('$gt' in op || '$gte' in op || '$lt' in op || '$lte' in op) {
          const range: Record<string, number> = {};
          if ('$gt' in op) range.gt = op.$gt;
          if ('$gte' in op) range.gte = op.$gte;
          if ('$lt' in op) range.lt = op.$lt;
          if ('$lte' in op) range.lte = op.$lte;
          must.push({ key, range: range as Schemas['Range'] });
        } else if ('$exists' in op) {
          if (op.$exists) {
            must.push({ key, values_count: { gt: 0 } });
          } else {
            mustNot.push({ key, values_count: { gt: 0 } });
          }
        }
      } else {
        must.push({ key, match: { value: value as unknown } });
      }
    }

    const result: Schemas['Filter'] = {};
    if (must.length > 0) result.must = must;
    if (mustNot.length > 0) result.must_not = mustNot;
    return result;
  }

  async deleteCollection(collectionName: string): Promise<void> {
    await this.client.deleteCollection(collectionName);
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const info = await this.client.getCollection(collectionName);
      const vectors = info.config?.params?.vectors;
      let dim = this.config.vectorSize;
      if (vectors && typeof vectors === 'object' && 'size' in vectors) {
        dim = (vectors as { size: number }).size;
      }
      return {
        collectionName,
        vectorCount: info.points_count ?? 0,
        vectorDimension: dim,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    const result = await this.client.getCollections();
    return result.collections.map((c) => c.name);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {}

  async scanPoints(
    collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    const result = await this.client.scroll(collectionName, {
      limit: options?.batchSize ?? 100,
      offset: options?.cursor,
      with_payload: true,
      with_vector: true,
    });

    return {
      points: result.points.map((p) => ({
        id: p.id as string,
        vector: p.vector as number[],
        payload: (p.payload as Record<string, unknown>) ?? {},
      })),
      nextCursor: result.next_page_offset != null ? String(result.next_page_offset) : undefined,
    };
  }
}

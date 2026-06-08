import { Client } from '@opensearch-project/opensearch';
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

export interface OpenSearchClientConfig {
  node: string;
  apiKey?: string;
  username?: string;
  password?: string;
  indexName: string;
  vectorDimension: number;
}

interface OSHit {
  _id?: string;
  _score?: number;
  _source?: {
    id?: string;
    payload?: Record<string, unknown>;
    vector?: number[];
    content?: string;
  };
}

export class OpenSearchClientWrapper implements VectorStoreAdapter {
  readonly provider = 'opensearch' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: true,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: false,
    supportsQuantization: true,
    supportsScan: true,
    maxBatchSize: 500,
    maxVectorDimension: 16000,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: OpenSearchClientConfig;
  private client: Client | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: OpenSearchClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    const auth: Record<string, string> = {};
    if (this.config.apiKey) {
      auth.apiKey = this.config.apiKey;
    } else if (this.config.username && this.config.password) {
      auth.username = this.config.username;
      auth.password = this.config.password;
    }

    this.client = new Client({
      node: this.config.node,
      ...auth,
    });

    const exists = await this.client.indices.exists({ index: this.config.indexName });
    if (!exists.body) {
      await this.client.indices.create({
        index: this.config.indexName,
        body: {
          settings: {
            'index.knn': true,
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              vector: {
                type: 'knn_vector',
                dimension: this.config.vectorDimension,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'nmslib',
                },
              },
              payload: { type: 'object', enabled: true },
              content: { type: 'text' },
            },
          },
        },
      });
    }

    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();

    const knnQuery: {
      vector: {
        field: string;
        query_vector: number[];
        k: number;
        filter?: Record<string, unknown>;
      };
    } = {
      vector: {
        field: 'vector',
        query_vector: options.vector,
        k: options.topK,
      },
    };

    if (options.filter) {
      knnQuery.vector.filter = this.buildOSFilter(options.filter);
    }

    if (options.hybridQuery) {
      const body: {
        size: number;
        query: {
          hybrid: {
            queries: ({ knn: typeof knnQuery } | { match: { content: string } })[];
          };
        };
        _source: string[];
      } = {
        size: options.topK,
        query: {
          hybrid: {
            queries: [{ knn: knnQuery }, { match: { content: options.hybridQuery } }],
          },
        },
        _source: ['id', 'payload'],
      };

      const result = await this.client!.search({
        index: this.config.indexName,
        body,
      });

      const hits = result.body?.hits?.hits ?? [];
      return (hits as OSHit[]).map((hit) => ({
        chunkId: hit._source?.id ?? hit._id ?? '',
        documentId: (hit._source?.payload?.documentId as string) ?? '',
        content: (hit._source?.payload?.content as string) ?? '',
        score: hit._score ?? 0,
        source: 'hybrid-native' as const,
        metadata: (hit._source?.payload as Record<string, unknown>) ?? {},
      }));
    }

    const body: {
      size: number;
      query: { knn: typeof knnQuery };
      _source: string[];
    } = {
      size: options.topK,
      query: { knn: knnQuery },
      _source: ['id', 'payload'],
    };

    const result = await this.client!.search({
      index: this.config.indexName,
      body,
    });

    const hits = result.body?.hits?.hits ?? [];
    return (hits as OSHit[]).map((hit) => ({
      chunkId: hit._source?.id ?? hit._id ?? '',
      documentId: (hit._source?.payload?.documentId as string) ?? '',
      content: (hit._source?.payload?.content as string) ?? '',
      score: hit._score ?? 0,
      source: 'vector' as const,
      metadata: (hit._source?.payload as Record<string, unknown>) ?? {},
    }));
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    this.ensureInitialized();
    await this.client!.index({
      index: this.config.indexName,
      id: point.id,
      body: {
        id: point.id,
        vector: point.vector,
        payload: point.payload,
        content: (point.payload?.content as string) ?? '',
      },
    });
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const batchSize = this.capabilities.maxBatchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const operations: unknown[] = [];
      for (const point of batch) {
        operations.push({ index: { _index: this.config.indexName, _id: point.id } });
        operations.push({
          id: point.id,
          vector: point.vector,
          payload: point.payload,
          content: (point.payload?.content as string) ?? '',
        });
      }
      await this.client!.bulk({ body: operations } as { body: Record<string, unknown>[] });
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    await this.client!.indices.delete({ index: collectionName });
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      await this.client!.indices.get({ index: collectionName });
      const stats = await this.client!.count({ index: collectionName });
      return {
        collectionName,
        vectorCount: stats.body?.count ?? 0,
        vectorDimension: this.config.vectorDimension,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const response = await this.client!.indices.get({ index: '*' });
      return Object.keys(response.body ?? response);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client!.ping();
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
    collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const size = options?.batchSize ?? 100;

    if (options?.cursor) {
      const result = await this.client!.scroll({
        scroll_id: options.cursor,
        scroll: '1m',
      });
      const hits = result.body?.hits?.hits ?? [];
      const points: VectorStorePoint[] = (hits as OSHit[]).map((hit) => ({
        id: hit._source?.id ?? hit._id ?? '',
        vector: hit._source?.vector ?? [],
        payload: hit._source?.payload ?? {},
      }));
      return {
        points,
        nextCursor: hits.length === size ? result.body?._scroll_id : undefined,
      };
    }

    const result = await this.client!.search({
      index: collectionName,
      body: {
        query: { match_all: {} },
        size,
        _source: ['id', 'vector', 'payload'],
      },
      scroll: '1m',
    });

    const hits = result.body?.hits?.hits ?? [];
    const points: VectorStorePoint[] = (hits as OSHit[]).map((hit) => ({
      id: hit._source?.id ?? hit._id ?? '',
      vector: hit._source?.vector ?? [],
      payload: hit._source?.payload ?? {},
    }));

    return {
      points,
      nextCursor: hits.length === size ? result.body?._scroll_id : undefined,
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('OpenSearchClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildOSFilter(filter: StandardFilter): Record<string, unknown> {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        return {
          bool: { must: (filter.$and as StandardFilter[]).map((f) => this.buildOSFilter(f)) },
        };
      } else if ('$or' in filter) {
        return {
          bool: {
            should: (filter.$or as StandardFilter[]).map((f) => this.buildOSFilter(f)),
            minimum_should_match: 1,
          },
        };
      }
    }

    const must: (
      | { term: Record<string, unknown> }
      | { terms: Record<string, unknown> }
      | { range: Record<string, unknown> }
      | { exists: { field: string } }
      | { bool: Record<string, unknown> }
    )[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (value === null || value === undefined) {
        must.push({ bool: { must_not: { exists: { field: `payload.${key}` } } } });
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) must.push({ term: { [`payload.${key}`]: op.$eq } });
        else if ('$ne' in op)
          must.push({ bool: { must_not: { term: { [`payload.${key}`]: op.$ne } } } });
        else if ('$in' in op)
          must.push({ terms: { [`payload.${key}`]: op.$in as (string | number)[] } });
        else if ('$nin' in op)
          must.push({
            bool: { must_not: { terms: { [`payload.${key}`]: op.$nin as (string | number)[] } } },
          });
        else if ('$gt' in op) must.push({ range: { [`payload.${key}`]: { gt: op.$gt } } });
        else if ('$gte' in op) must.push({ range: { [`payload.${key}`]: { gte: op.$gte } } });
        else if ('$lt' in op) must.push({ range: { [`payload.${key}`]: { lt: op.$lt } } });
        else if ('$lte' in op) must.push({ range: { [`payload.${key}`]: { lte: op.$lte } } });
        else if ('$exists' in op) {
          if (op.$exists) must.push({ exists: { field: `payload.${key}` } });
          else must.push({ bool: { must_not: { exists: { field: `payload.${key}` } } } });
        }
      } else {
        must.push({ term: { [`payload.${key}`]: value } });
      }
    }

    return { bool: { must } };
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

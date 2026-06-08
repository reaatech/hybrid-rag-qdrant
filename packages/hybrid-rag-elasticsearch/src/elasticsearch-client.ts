import { Client } from '@elastic/elasticsearch';
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

export interface ElasticsearchClientConfig {
  node: string;
  apiKey?: string;
  username?: string;
  password?: string;
  indexName: string;
  vectorDimension: number;
}

interface ESHit {
  _id?: string;
  _score?: number;
  _source?: {
    id?: string;
    payload?: Record<string, unknown>;
    vector?: number[];
    content?: string;
  };
}

export class ElasticsearchClientWrapper implements VectorStoreAdapter {
  readonly provider = 'elasticsearch' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: true,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: false,
    supportsQuantization: true,
    supportsScan: true,
    maxBatchSize: 500,
    maxVectorDimension: 4096,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: ElasticsearchClientConfig;
  private client: Client | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: ElasticsearchClientConfig) {
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
    if (!exists) {
      await this.client.indices.create({
        index: this.config.indexName,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              vector: {
                type: 'dense_vector',
                dims: this.config.vectorDimension,
                index: true,
                similarity: 'cosine',
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
      field: string;
      query_vector: number[];
      k: number;
      num_candidates: number;
      filter?: Record<string, unknown>;
    } = {
      field: 'vector',
      query_vector: options.vector,
      k: options.topK,
      num_candidates: options.topK * 2,
    };

    if (options.filter) {
      knnQuery.filter = this.buildESFilter(options.filter);
    }

    const body: {
      knn: typeof knnQuery;
      size: number;
      _source: string[];
    } = {
      knn: knnQuery,
      size: options.topK,
      _source: ['id', 'payload', 'content'],
    };

    if (options.hybridQuery) {
      const hybridBody: {
        query: {
          bool: {
            should: { match: { content: string } }[];
            filter?: Record<string, unknown>;
          };
        };
        knn: typeof knnQuery;
        size: number;
        _source: string[];
      } = {
        query: {
          bool: {
            should: [{ match: { content: options.hybridQuery } }],
          },
        },
        knn: knnQuery,
        size: options.topK,
        _source: ['id', 'payload'],
      };

      if (options.filter) {
        hybridBody.query.bool.filter = this.buildESFilter(options.filter);
      }

      const queryResult = await this.client!.search({
        index: this.config.indexName,
        body: hybridBody,
      });

      return ((queryResult.hits?.hits ?? []) as ESHit[]).map((hit) => ({
        chunkId: hit._source?.id ?? hit._id ?? '',
        documentId: (hit._source?.payload?.documentId as string) ?? '',
        content: (hit._source?.payload?.content as string) ?? '',
        score: hit._score ?? 0,
        source: 'hybrid-native' as const,
        metadata: (hit._source?.payload as Record<string, unknown>) ?? {},
      }));
    }

    const result = await this.client!.search({
      index: this.config.indexName,
      body: body,
    });

    return ((result.hits?.hits ?? []) as ESHit[]).map((hit) => ({
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
      await this.client!.bulk({ body: operations } as { body: unknown[] });
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
        vectorCount: stats.count ?? 0,
        vectorDimension: this.config.vectorDimension,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const response = await this.client!.indices.get({ index: '*' });
      return Object.keys(response);
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
      const hits = (result.hits?.hits ?? []) as ESHit[];
      const points: VectorStorePoint[] = hits.map((hit) => ({
        id: hit._source?.id ?? hit._id ?? '',
        vector: hit._source?.vector ?? [],
        payload: hit._source?.payload ?? {},
      }));
      return {
        points,
        nextCursor: hits.length === size ? result._scroll_id : undefined,
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

    const hits = (result.hits?.hits ?? []) as ESHit[];
    const points: VectorStorePoint[] = hits.map((hit) => ({
      id: hit._source?.id ?? hit._id ?? '',
      vector: hit._source?.vector ?? [],
      payload: hit._source?.payload ?? {},
    }));

    return {
      points,
      nextCursor: hits.length === size ? result._scroll_id : undefined,
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('ElasticsearchClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildESFilter(filter: StandardFilter): Record<string, unknown> {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        return {
          bool: { must: (filter.$and as StandardFilter[]).map((f) => this.buildESFilter(f)) },
        };
      } else if ('$or' in filter) {
        return {
          bool: {
            should: (filter.$or as StandardFilter[]).map((f) => this.buildESFilter(f)),
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

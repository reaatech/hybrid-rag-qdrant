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
import type { RedisClientType } from 'redis';
import { createClient } from 'redis';

export interface RedisVectorClientConfig {
  url: string;
  indexName: string;
  vectorDimension: number;
  keyPrefix?: string;
}

export class RedisVectorClientWrapper implements VectorStoreAdapter {
  readonly provider = 'redis' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: true,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: true,
    supportsQuantization: false,
    supportsScan: true,
    maxBatchSize: 1000,
    maxVectorDimension: 32768,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: RedisVectorClientConfig;
  private client: RedisClientType | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: RedisVectorClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    this.client = createClient({ url: this.config.url });
    await this.client.connect();

    try {
      await this.client.ft.info(this.config.indexName);
    } catch {
      const ftSchema: Record<string, unknown> = {
        '$.vector': {
          type: 'VECTOR',
          ALGORITHM: 'FLAT',
          DIM: String(this.config.vectorDimension),
          DISTANCE_METRIC: 'COSINE',
          TYPE: 'FLOAT32',
        },
        '$.id': { type: 'TAG', AS: 'id' },
        '$.payload': { type: 'TEXT', AS: 'payload' },
      };
      await this.client.ft.create(
        this.config.indexName,
        ftSchema as unknown as import('redis').RediSearchSchema,
        { ON: 'JSON', PREFIX: this.config.keyPrefix ?? 'vector:' },
      );
    }

    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const vectorParam = `[${options.vector.join(',')}]`;
    let filterClause = '';

    if (options.filter) {
      filterClause = this.buildRedisFilter(options.filter);
    }

    let query = `(*)=>[KNN ${options.topK} @vector $vector AS score]`;
    if (filterClause) {
      query = `(${filterClause})=>[KNN ${options.topK} @vector $vector AS score]`;
    }

    if (options.hybridQuery) {
      const textQuery = options.hybridQuery
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .join(' ');
      if (textQuery) {
        query = `(${textQuery})=>[KNN ${options.topK} @vector $vector AS score]`;
        if (filterClause) {
          query = `(${filterClause} ${textQuery})=>[KNN ${options.topK} @vector $vector AS score]`;
        }
      }
    }

    const results = await this.client!.ft.search(this.config.indexName, query, {
      PARAMS: { vector: vectorParam },
      SORTBY: 'score',
      DIALECT: 2,
      LIMIT: { from: 0, size: options.topK },
    });

    return results.documents.map((doc) => {
      const value = (doc.value as Record<string, unknown>) ?? {};
      return {
        chunkId: (value.id as string) ?? doc.id,
        documentId: ((value.payload as Record<string, unknown>)?.documentId as string) ?? '',
        content: ((value.payload as Record<string, unknown>)?.content as string) ?? '',
        score: (value.score as number) ?? 0,
        source: 'vector' as const,
        metadata: (value.payload as Record<string, unknown>) ?? {},
      };
    });
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    this.ensureInitialized();
    const key = `${this.config.keyPrefix ?? 'vector:'}${point.id}`;
    const payload: Record<string, unknown> = {
      ...point.payload,
      id: point.id,
      content: (point.payload?.content as string) ?? '',
      documentId: point.payload?.documentId,
    };

    await (
      this.client!.json.set as (key: string, path: string, value: unknown) => Promise<unknown>
    )(key, '$', {
      id: point.id,
      vector: point.vector,
      payload,
    });
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const multi = this.client!.multi();
    const prefix = this.config.keyPrefix ?? 'vector:';

    for (const point of points) {
      const key = `${prefix}${point.id}`;
      const payload: Record<string, unknown> = {
        ...point.payload,
        id: point.id,
        content: (point.payload?.content as string) ?? '',
        documentId: point.payload?.documentId,
      };

      (multi.json.set as (key: string, path: string, value: unknown) => unknown)(key, '$', {
        id: point.id,
        vector: point.vector,
        payload,
      });
    }

    await multi.exec();
  }

  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    try {
      await this.client!.ft.dropIndex(collectionName);
    } catch {}
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const info = await this.client!.ft.info(collectionName);
      return {
        collectionName,
        vectorCount: Number(info.numDocs) ?? 0,
        vectorDimension: this.config.vectorDimension,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const result = await this.client!.ft._list();
      return result;
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
      await this.client.quit();
    }
  }

  async scanPoints(
    _collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const prefix = this.config.keyPrefix ?? 'vector:';
    const count = options?.batchSize ?? 100;
    const cursor = options?.cursor ?? '0';

    const result = await (
      this.client!.scan as unknown as (
        cursor: string,
        opts: { MATCH: string; COUNT: number },
      ) => Promise<{ cursor: string; keys: string[] }>
    )(cursor, {
      MATCH: `${prefix}*`,
      COUNT: count,
    });

    const points: VectorStorePoint[] = [];
    for (const key of result.keys) {
      try {
        const value = await (
          this.client!.json.get as (key: string, path: string) => Promise<unknown>
        )(key, '$');
        if (value) {
          const data = (Array.isArray(value) ? value[0] : value) as Record<string, unknown>;
          points.push({
            id: (data?.id as string) ?? key.replace(prefix, ''),
            vector: (data?.vector as number[]) ?? [],
            payload: (data?.payload as Record<string, unknown>) ?? {},
          });
        }
      } catch {}
    }

    return {
      points,
      nextCursor: String(result.cursor) !== '0' ? String(result.cursor) : undefined,
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('RedisVectorClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildRedisFilter(filter: StandardFilter): string {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        return (filter.$and as StandardFilter[]).map((f) => this.buildRedisFilter(f)).join(' ');
      }
      if ('$or' in filter) {
        return (filter.$or as StandardFilter[])
          .map((f) => `(${this.buildRedisFilter(f)})`)
          .join(' | ');
      }
    }

    const conditions: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      const field = `@payload_${key}`;

      if (value === null || value === undefined) {
        conditions.push(`-${field}:*`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) conditions.push(`${field}:{${String(op.$eq)}}`);
        else if ('$ne' in op) conditions.push(`-${field}:{${String(op.$ne)}}`);
        else if ('$in' in op) {
          const arr = op.$in;
          const values = arr.map((v) => String(v)).join('|');
          conditions.push(`${field}:{${values}}`);
        } else if ('$nin' in op) {
          const arr = op.$nin;
          const values = arr.map((v) => String(v)).join('|');
          conditions.push(`-${field}:{${values}}`);
        } else if ('$exists' in op) {
          conditions.push(op.$exists ? `${field}:*` : `-${field}:*`);
        } else if ('$gt' in op) conditions.push(`${field}:[(${op.$gt} inf]`);
        else if ('$gte' in op) conditions.push(`${field}:[${op.$gte} inf]`);
        else if ('$lt' in op) conditions.push(`${field}:[-inf (${op.$lt}]`);
        else if ('$lte' in op) conditions.push(`${field}:[-inf ${op.$lte}]`);
      } else {
        conditions.push(`${field}:{${String(value)}}`);
      }
    }

    return conditions.join(' ');
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

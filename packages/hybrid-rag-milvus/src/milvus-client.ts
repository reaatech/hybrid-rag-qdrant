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
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

export interface MilvusClientConfig {
  address: string;
  token?: string;
  collectionName: string;
  vectorDimension: number;
  database?: string;
}

interface MilvusHit {
  id?: string;
  score?: number;
  payload?: Record<string, unknown>;
}

interface MilvusCollectionInfo {
  name: string;
}

interface MilvusRow {
  id?: string;
  vector?: number[];
  payload?: string | Record<string, unknown>;
}

export class MilvusClientWrapper implements VectorStoreAdapter {
  readonly provider = 'milvus' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: false,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: true,
    supportsQuantization: true,
    supportsScan: true,
    maxBatchSize: 1000,
    maxVectorDimension: 32768,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: MilvusClientConfig;
  private client: MilvusClient | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: MilvusClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    this.client = new MilvusClient({
      address: this.config.address,
      token: this.config.token,
    });

    if (this.config.database) {
      await this.client.useDatabase({ db_name: this.config.database });
    }

    const exists = await this.client.hasCollection({
      collection_name: this.config.collectionName,
    });

    if (!exists.value) {
      await this.client.createCollection({
        collection_name: this.config.collectionName,
        fields: [
          { name: 'id', data_type: 'VarChar', is_primary_key: true, max_length: 512 },
          { name: 'vector', data_type: 'FloatVector', dim: this.config.vectorDimension },
          { name: 'payload', data_type: 'JSON' },
        ],
      });

      await this.client.createIndex({
        collection_name: this.config.collectionName,
        field_name: 'vector',
        index_type: 'IVF_FLAT',
        metric_type: 'IP',
      });

      await this.client.loadCollection({
        collection_name: this.config.collectionName,
      });
    }

    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const searchParams: {
      collection_name: string;
      vector: number[];
      limit: number;
      output_fields: string[];
      metric_type: string;
      params: { nprobe: number };
      expr?: string;
    } = {
      collection_name: this.config.collectionName,
      vector: options.vector,
      limit: options.topK,
      output_fields: ['id', 'payload'],
      metric_type: 'IP',
      params: { nprobe: 10 },
    };

    if (options.filter) {
      searchParams.expr = this.buildMilvusFilter(options.filter);
    }

    const results = await this.client!.search(searchParams);

    return ((results.results ?? []) as MilvusHit[]).map((hit) => ({
      chunkId: hit.id ?? '',
      documentId: (hit.payload?.documentId as string) ?? '',
      content: (hit.payload?.content as string) ?? '',
      score: hit.score ?? 0,
      source: 'vector' as const,
      metadata: (hit.payload as Record<string, unknown>) ?? {},
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
      await this.client!.insert({
        collection_name: this.config.collectionName,
        fields_data: batch.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: JSON.stringify(p.payload),
        })),
      });
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    await this.client!.dropCollection({ collection_name: collectionName });
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const stats = await this.client!.getCollectionStatistics({ collection_name: collectionName });
      const rowCount = stats.stats?.find(
        (s: { key: string; value: string | number }) => s.key === 'row_count',
      );
      return {
        collectionName,
        vectorCount: rowCount ? Number(rowCount.value) : 0,
        vectorDimension: this.config.vectorDimension,
        indexType: 'IVF_FLAT',
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const result = await this.client!.listCollections();
      return (result.data ?? []).map((c: MilvusCollectionInfo) => c.name);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client!.listCollections();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.client?.closeConnection();
  }

  async scanPoints(
    collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const limit = options?.batchSize ?? 100;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const results = await this.client!.query({
      collection_name: collectionName,
      output_fields: ['id', 'vector', 'payload'],
      limit,
      offset,
    });

    const points: VectorStorePoint[] = ((results.data ?? []) as MilvusRow[]).map((row) => ({
      id: row.id ?? '',
      vector: row.vector ?? [],
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload ?? {}),
    }));

    const nextOffset = offset + points.length;
    const nextCursor = points.length >= limit ? String(nextOffset) : undefined;

    return { points, nextCursor };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('MilvusClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildMilvusFilter(filter: StandardFilter): string {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        const parts = (filter.$and as StandardFilter[]).map((f) => this.buildMilvusFilter(f));
        return parts.length > 1 ? `(${parts.join(' and ')})` : (parts[0] ?? '');
      }
      if ('$or' in filter) {
        const parts = (filter.$or as StandardFilter[]).map((f) => this.buildMilvusFilter(f));
        return parts.length > 1 ? `(${parts.join(' or ')})` : (parts[0] ?? '');
      }
    }

    const conditions: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      const field = `payload['${key.replace(/'/g, "\\'")}']`;

      if (value === null || value === undefined) {
        conditions.push(`${field} == null`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) conditions.push(`${field} == ${this.milvusValue(op.$eq)}`);
        else if ('$ne' in op) conditions.push(`${field} != ${this.milvusValue(op.$ne)}`);
        else if ('$in' in op) {
          const arr = op.$in;
          conditions.push(`${field} in [${arr.map((v) => this.milvusValue(v)).join(',')}]`);
        } else if ('$nin' in op) {
          const arr = op.$nin;
          conditions.push(`${field} not in [${arr.map((v) => this.milvusValue(v)).join(',')}]`);
        } else if ('$gt' in op) conditions.push(`${field} > ${op.$gt}`);
        else if ('$gte' in op) conditions.push(`${field} >= ${op.$gte}`);
        else if ('$lt' in op) conditions.push(`${field} < ${op.$lt}`);
        else if ('$lte' in op) conditions.push(`${field} <= ${op.$lte}`);
      } else {
        conditions.push(`${field} == ${this.milvusValue(value)}`);
      }
    }

    return conditions.join(' and ');
  }

  private milvusValue(value: unknown): string {
    if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
    if (value === null) return 'null';
    return String(value);
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

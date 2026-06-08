import * as lancedb from '@lancedb/lancedb';
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

export interface LanceDBClientConfig {
  uri: string;
  tableName: string;
  vectorDimension: number;
}

export class LanceDBClientWrapper implements VectorStoreAdapter {
  readonly provider = 'lancedb' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: false,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: false,
    supportsQuantization: true,
    supportsScan: true,
    maxBatchSize: 1000,
    maxVectorDimension: 32768,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: LanceDBClientConfig;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: LanceDBClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    this.db = await lancedb.connect(this.config.uri);

    const tableNames = await this.db.tableNames();
    if (tableNames.includes(this.config.tableName)) {
      this.table = await this.db.openTable(this.config.tableName);
    } else {
      const records: Record<string, unknown>[] = [];
      this.table = await this.db.createTable({
        name: this.config.tableName,
        data: records,
      });
    }

    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();

    let query = this.table!.vectorSearch(options.vector).limit(options.topK);

    if (options.filter) {
      const whereClause = this.buildLanceFilter(options.filter);
      query = query.where(whereClause);
    }

    const results = await query.toArray();

    return results.map((row: Record<string, unknown>) => ({
      chunkId: (row.id as string) ?? '',
      documentId: ((row.payload as Record<string, unknown>)?.documentId as string) ?? '',
      content: ((row.payload as Record<string, unknown>)?.content as string) ?? '',
      score: (row._distance as number) !== undefined ? 1 - (row._distance as number) : 0,
      source: 'vector' as const,
      metadata: (row.payload as Record<string, unknown>) ?? {},
    }));
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    this.ensureInitialized();
    await this.table!.add([
      {
        id: point.id,
        vector: new Float32Array(point.vector),
        payload: point.payload,
      },
    ]);
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const batchSize = this.capabilities.maxBatchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const records = batch.map((point) => ({
        id: point.id,
        vector: new Float32Array(point.vector),
        payload: point.payload,
      }));
      await this.table!.add(records);
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    await this.db!.dropTable(collectionName);
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const tbl = await this.db!.openTable(collectionName);
      const count = await tbl.countRows();
      return {
        collectionName,
        vectorCount: count,
        vectorDimension: this.config.vectorDimension,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      return await this.db!.tableNames();
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.db!.tableNames();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  async scanPoints(
    collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const limit = options?.batchSize ?? 100;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const tbl = collectionName ? await this.db!.openTable(collectionName) : this.table!;
    const results = await tbl.query().limit(limit).offset(offset).toArray();

    const points: VectorStorePoint[] = results.map((row: Record<string, unknown>) => ({
      id: (row.id as string) ?? '',
      vector: Array.from(row.vector as Float32Array) ?? [],
      payload: (row.payload as Record<string, unknown>) ?? {},
    }));

    const nextOffset = offset + points.length;
    const nextCursor = points.length >= limit ? String(nextOffset) : undefined;

    return { points, nextCursor };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.table) {
      throw new Error('LanceDBClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildLanceFilter(filter: StandardFilter): string {
    if ('$and' in filter && filter.$and) {
      const filters = filter.$and as StandardFilter[];
      return filters.map((f) => this.buildLanceFilter(f)).join(' AND ');
    }
    if ('$or' in filter && filter.$or) {
      const filters = filter.$or as StandardFilter[];
      return `(${filters.map((f) => this.buildLanceFilter(f)).join(' OR ')})`;
    }

    const conditions: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      const field = `payload.${key}`;

      if (value === null || value === undefined) {
        conditions.push(`${field} IS NULL`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) conditions.push(`${field} = ${this.lanceValue(op.$eq)}`);
        else if ('$ne' in op) conditions.push(`${field} != ${this.lanceValue(op.$ne)}`);
        else if ('$in' in op) {
          const arr = op.$in;
          conditions.push(`${field} IN (${arr.map((v) => this.lanceValue(v)).join(',')})`);
        } else if ('$nin' in op) {
          const arr = op.$nin;
          conditions.push(`${field} NOT IN (${arr.map((v) => this.lanceValue(v)).join(',')})`);
        } else if ('$exists' in op) {
          conditions.push(op.$exists ? `${field} IS NOT NULL` : `${field} IS NULL`);
        } else if ('$gt' in op) conditions.push(`${field} > ${op.$gt}`);
        else if ('$gte' in op) conditions.push(`${field} >= ${op.$gte}`);
        else if ('$lt' in op) conditions.push(`${field} < ${op.$lt}`);
        else if ('$lte' in op) conditions.push(`${field} <= ${op.$lte}`);
      } else {
        conditions.push(`${field} = ${this.lanceValue(value)}`);
      }
    }

    return conditions.join(' AND ');
  }

  private lanceValue(value: unknown): string {
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (value === null) return 'NULL';
    return String(value);
  }
}

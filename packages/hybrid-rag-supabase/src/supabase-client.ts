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
import type { PostgrestFilterBuilder, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

export interface SupabaseVectorClientConfig {
  url: string;
  serviceRoleKey: string;
  tableName: string;
  vectorDimension: number;
  schema?: string;
}

export class SupabaseVectorClientWrapper implements VectorStoreAdapter {
  readonly provider = 'supabase' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: false,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: false,
    supportsMultiTenancy: true,
    supportsQuantization: false,
    supportsScan: true,
    maxBatchSize: 500,
    maxVectorDimension: 16000,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: SupabaseVectorClientConfig;
  private client: SupabaseClient | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: SupabaseVectorClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    this.client = createClient(this.config.url, this.config.serviceRoleKey);
    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const vectorStr = `[${options.vector.join(',')}]`;

    let query = this.schemaClient().rpc('match_documents', {
      query_embedding: vectorStr,
      match_threshold: 0.0,
      match_count: options.topK,
    });

    if (options.filter) {
      query = this.applySupabaseFilter(query, options.filter);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Supabase search failed: ${error.message}`);

    const results = (data as Array<Record<string, unknown>>) ?? [];
    return results.map((row) => ({
      chunkId: (row.id as string) ?? '',
      documentId: (row.documentId as string) ?? (row.document_id as string) ?? '',
      content: (row.content as string) ?? '',
      score: (row.similarity as number) ?? (row.score as number) ?? 0,
      source: 'vector' as const,
      metadata: row as Record<string, unknown>,
    }));
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    this.ensureInitialized();
    const { error } = await this.tableClient().upsert({
      id: point.id,
      embedding: point.vector,
      content: (point.payload?.content as string) ?? '',
      document_id: (point.payload?.documentId as string) ?? '',
      metadata: point.payload,
    });

    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const batchSize = this.capabilities.maxBatchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const records = batch.map((point) => ({
        id: point.id,
        embedding: point.vector,
        content: (point.payload?.content as string) ?? '',
        document_id: (point.payload?.documentId as string) ?? '',
        metadata: point.payload,
      }));

      const { error } = await this.tableClient().upsert(records);

      if (error) throw new Error(`Supabase batch upsert failed: ${error.message}`);
    }
  }

  async deleteCollection(_collectionName: string): Promise<void> {
    throw new Error(
      'Supabase does not support collection management via the adapter. Drop the table directly in Supabase dashboard.',
    );
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const { count, error } = await this.client!.from(collectionName).select('*', {
        count: 'exact',
        head: true,
      });

      if (error) return null;
      return {
        collectionName,
        vectorCount: count ?? 0,
        vectorDimension: this.config.vectorDimension,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const { data, error } = await this.client!.rpc('get_tables');
      if (error) return [];
      return (data ?? []) as string[];
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await this.tableClient().select('id', {
        count: 'exact',
        head: true,
      });
      return !error;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {}

  async scanPoints(
    collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const limit = options?.batchSize ?? 100;
    const fromRow = options?.cursor ? parseInt(options.cursor, 10) : 0;
    const toRow = fromRow + limit - 1;

    const { data, error } = await this.tableClient(collectionName)
      .select('*')
      .range(fromRow, toRow);

    if (error) throw new Error(`Supabase scan failed: ${error.message}`);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const points: VectorStorePoint[] = rows.map((row) => ({
      id: (row.id as string) ?? '',
      vector: (row.embedding as number[]) ?? [],
      payload: (row.metadata as Record<string, unknown>) ?? {},
    }));

    const nextFrom = fromRow + points.length;
    const nextCursor = points.length >= limit ? String(nextFrom) : undefined;

    return { points, nextCursor };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('SupabaseVectorClientWrapper not initialized. Call initialize() first.');
    }
  }

  private schemaClient(): ReturnType<SupabaseClient['schema']> | SupabaseClient {
    return this.config.schema ? this.client!.schema(this.config.schema) : this.client!;
  }

  private tableClient(tableName = this.config.tableName): ReturnType<SupabaseClient['from']> {
    return this.schemaClient().from(tableName);
  }

  private applySupabaseFilter(
    query: PostgrestFilterBuilder<any, any, any, any, any, any, any>,
    filter: StandardFilter,
  ): PostgrestFilterBuilder<any, any, any, any, any, any, any> {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        for (const f of filter.$and as StandardFilter[]) {
          query = this.applySupabaseFilter(query, f);
        }
        return query;
      }
      if ('$or' in filter) {
        const clauses = (filter.$or as StandardFilter[]).map((f) => this.buildSupabaseOrClause(f));
        return query.or(clauses.join(','));
      }
    }

    for (const [key, value] of Object.entries(filter)) {
      const field = this.supabaseField(key);
      if (value === null || value === undefined) {
        query = query.is(field, null);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) query = query.eq(field, op.$eq);
        else if ('$ne' in op) query = query.neq(field, op.$ne);
        else if ('$in' in op) {
          const arr = op.$in as (string | number)[];
          query = query.in(field, arr);
        } else if ('$nin' in op) {
          const arr = op.$nin as (string | number)[];
          query = query.not(field, 'in', `(${arr.map((v) => this.postgrestValue(v)).join(',')})`);
        } else if ('$exists' in op) {
          query = op.$exists ? query.not(field, 'is', null) : query.is(field, null);
        } else if ('$gt' in op) query = query.gt(field, op.$gt);
        else if ('$gte' in op) query = query.gte(field, op.$gte);
        else if ('$lt' in op) query = query.lt(field, op.$lt);
        else if ('$lte' in op) query = query.lte(field, op.$lte);
      } else {
        query = query.eq(field, value);
      }
    }

    return query;
  }

  private buildSupabaseOrClause(filter: StandardFilter): string {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        return `and(${(filter.$and as StandardFilter[]).map((f) => this.buildSupabaseOrClause(f)).join(',')})`;
      }
      if ('$or' in filter) {
        return `or(${(filter.$or as StandardFilter[]).map((f) => this.buildSupabaseOrClause(f)).join(',')})`;
      }
    }

    const clauses: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      const field = this.supabaseField(key);
      if (value === null || value === undefined) {
        clauses.push(`${field}.is.null`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) clauses.push(`${field}.eq.${this.postgrestValue(op.$eq)}`);
        else if ('$ne' in op) clauses.push(`${field}.neq.${this.postgrestValue(op.$ne)}`);
        else if ('$in' in op) {
          const arr = op.$in as (string | number)[];
          clauses.push(`${field}.in.(${arr.map((v) => this.postgrestValue(v)).join(',')})`);
        } else if ('$nin' in op) {
          const arr = op.$nin as (string | number)[];
          clauses.push(`not.${field}.in.(${arr.map((v) => this.postgrestValue(v)).join(',')})`);
        } else if ('$exists' in op) {
          clauses.push(op.$exists ? `not.${field}.is.null` : `${field}.is.null`);
        } else if ('$gt' in op) clauses.push(`${field}.gt.${op.$gt}`);
        else if ('$gte' in op) clauses.push(`${field}.gte.${op.$gte}`);
        else if ('$lt' in op) clauses.push(`${field}.lt.${op.$lt}`);
        else if ('$lte' in op) clauses.push(`${field}.lte.${op.$lte}`);
      } else {
        clauses.push(`${field}.eq.${this.postgrestValue(value)}`);
      }
    }

    return clauses.length === 1 ? clauses[0]! : `and(${clauses.join(',')})`;
  }

  private supabaseField(key: string): string {
    return ['id', 'content', 'document_id', 'documentId', 'similarity', 'score'].includes(key)
      ? key
      : `metadata->>${key}`;
  }

  private postgrestValue(value: unknown): string {
    if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    if (value === null) return 'null';
    return String(value);
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

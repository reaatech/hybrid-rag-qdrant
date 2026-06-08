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
import pg from 'pg';

export interface PgVectorClientConfig {
  connectionString: string;
  tableName: string;
  vectorDimension: number;
  schema?: string;
}

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdentifier(id: string): string {
  if (!IDENTIFIER_RE.test(id)) {
    throw new Error(`Invalid SQL identifier: "${id}"`);
  }
  return `"${id}"`;
}

export class PgVectorClientWrapper implements VectorStoreAdapter {
  readonly provider = 'pgvector' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: false,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: true,
    supportsQuantization: false,
    supportsScan: true,
    maxBatchSize: 1000,
    maxVectorDimension: 16000,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: PgVectorClientConfig;
  private pool: pg.Pool | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: PgVectorClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: this.config.connectionString,
    });

    const schema = this.config.schema ?? 'public';
    const table = this.config.tableName;

    const client = await this.pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(`SET search_path TO ${quoteIdentifier(schema)}`);
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (
          id TEXT PRIMARY KEY,
          vector vector(${this.config.vectorDimension}),
          payload JSONB DEFAULT '{}'::jsonb
        )`,
      );
    } finally {
      client.release();
    }

    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const schema = this.config.schema ?? 'public';
    const table = this.config.tableName;
    const vectorParam = `[${options.vector.join(',')}]`;

    let whereClause = '';
    const params: unknown[] = [vectorParam, options.topK];
    let paramIdx = 3;

    if (options.filter) {
      const { clause, values } = this.buildWhereClause(options.filter, paramIdx);
      if (clause) {
        whereClause = `AND ${clause}`;
        params.push(...values);
        paramIdx += values.length;
      }
    }

    const sql = `
      SELECT id, 1 - (vector <=> $1::vector) AS score, payload
      FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}
      WHERE TRUE ${whereClause}
      ORDER BY vector <=> $1::vector
      LIMIT $2
    `;

    const result = await this.pool!.query(sql, params);
    return result.rows.map((row) => ({
      chunkId: row.id,
      documentId: (row.payload?.documentId as string) ?? '',
      content: (row.payload?.content as string) ?? '',
      score: parseFloat(row.score) ?? 0,
      source: 'vector' as const,
      metadata: (row.payload as Record<string, unknown>) ?? {},
    }));
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    await this.upsertBatch([point]);
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const schema = this.config.schema ?? 'public';
    const table = this.config.tableName;

    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      for (const point of points) {
        await client.query(
          `INSERT INTO ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (id, vector, payload)
           VALUES ($1, $2::vector, $3::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             vector = EXCLUDED.vector,
             payload = EXCLUDED.payload`,
          [point.id, `[${point.vector.join(',')}]`, JSON.stringify(point.payload)],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    const schema = this.config.schema ?? 'public';
    await this.pool!.query(
      `DROP TABLE IF EXISTS ${quoteIdentifier(schema)}.${quoteIdentifier(collectionName)}`,
    );
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const schema = this.config.schema ?? 'public';
      const result = await this.pool!.query(
        `SELECT count(*)::int AS count FROM ${quoteIdentifier(schema)}.${quoteIdentifier(collectionName)}`,
      );
      return {
        collectionName,
        vectorCount: result.rows[0]?.count ?? 0,
        vectorDimension: this.config.vectorDimension,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const schema = this.config.schema ?? 'public';
      const result = await this.pool!.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
        [schema],
      );
      return result.rows.map((r) => r.table_name);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool!.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async scanPoints(
    collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const schema = this.config.schema ?? 'public';
    const table = collectionName;
    const limit = options?.batchSize ?? 100;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const result = await this.pool!.query(
      `SELECT id, vector::text, payload
       FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const points: VectorStorePoint[] = result.rows.map((row) => ({
      id: row.id,
      vector: this.parseVector(row.vector),
      payload: row.payload ?? {},
    }));

    const nextOffset = offset + points.length;
    const nextCursor = points.length === limit ? String(nextOffset) : undefined;

    return { points, nextCursor };
  }

  private parseVector(vecStr: string): number[] {
    if (typeof vecStr === 'string') {
      return vecStr
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
    }
    if (Array.isArray(vecStr)) return (vecStr as unknown as number[]).map(Number);
    return [];
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.pool) {
      throw new Error('PgVectorClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildWhereClause(
    filter: StandardFilter,
    startParamIdx: number,
  ): { clause: string; values: unknown[] } {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        const parts = (filter.$and as StandardFilter[]).map((f, i) =>
          this.buildWhereClause(f, startParamIdx + i * 100),
        );
        const clauses = parts
          .filter((p: { clause: string }) => p.clause)
          .map((p: { clause: string }) => p.clause);
        if (clauses.length === 0) return { clause: '', values: [] };
        return {
          clause: `(${clauses.join(' AND ')})`,
          values: parts.flatMap((p: { values: unknown[] }) => p.values),
        };
      }
      if ('$or' in filter) {
        const parts = (filter.$or as StandardFilter[]).map((f, i) =>
          this.buildWhereClause(f, startParamIdx + i * 100),
        );
        const clauses = parts
          .filter((p: { clause: string }) => p.clause)
          .map((p: { clause: string }) => p.clause);
        if (clauses.length === 0) return { clause: '', values: [] };
        return {
          clause: `(${clauses.join(' OR ')})`,
          values: parts.flatMap((p: { values: unknown[] }) => p.values),
        };
      }
    }

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = startParamIdx;

    for (const [key, value] of Object.entries(filter)) {
      const fieldExpr = `payload->>'${key.replace(/'/g, "''")}'`;
      const jsonFieldExpr = `payload->'${key.replace(/'/g, "''")}'`;

      if (value === null || value === undefined) {
        conditions.push(`${jsonFieldExpr} IS NULL`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) {
          conditions.push(`${fieldExpr} = $${idx}`);
          values.push(op.$eq);
          idx++;
        } else if ('$ne' in op) {
          conditions.push(`${fieldExpr} != $${idx}`);
          values.push(op.$ne);
          idx++;
        } else if ('$in' in op) {
          const arr = op.$in;
          const placeholders = arr.map(() => `$${idx++}`).join(',');
          conditions.push(`${fieldExpr} IN (${placeholders})`);
          values.push(...arr);
        } else if ('$nin' in op) {
          const arr = op.$nin;
          const placeholders = arr.map(() => `$${idx++}`).join(',');
          conditions.push(`${fieldExpr} NOT IN (${placeholders})`);
          values.push(...arr);
        } else if ('$gt' in op) {
          conditions.push(`(${jsonFieldExpr})::numeric > $${idx}`);
          values.push(op.$gt);
          idx++;
        } else if ('$gte' in op) {
          conditions.push(`(${jsonFieldExpr})::numeric >= $${idx}`);
          values.push(op.$gte);
          idx++;
        } else if ('$lt' in op) {
          conditions.push(`(${jsonFieldExpr})::numeric < $${idx}`);
          values.push(op.$lt);
          idx++;
        } else if ('$lte' in op) {
          conditions.push(`(${jsonFieldExpr})::numeric <= $${idx}`);
          values.push(op.$lte);
          idx++;
        } else if ('$exists' in op) {
          if (op.$exists) conditions.push(`${jsonFieldExpr} IS NOT NULL`);
          else conditions.push(`${jsonFieldExpr} IS NULL`);
        }
      } else {
        conditions.push(`${fieldExpr} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    return {
      clause: conditions.length > 0 ? conditions.join(' AND ') : '',
      values,
    };
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

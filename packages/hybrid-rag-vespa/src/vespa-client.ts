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

export interface VespaClientConfig {
  endpoint: string;
  namespace: string;
  documentType: string;
  vectorDimension: number;
  apiKey?: string;
}

interface VespaSearchBody {
  yql: string;
  hits: number;
  'input.query(q)'?: string;
  query?: string;
  continuation?: string;
}

interface VespaQueryResponse {
  root?: {
    children?: Array<{
      id?: string;
      relevance?: number;
      fields?: Record<string, unknown>;
    }>;
  };
}

export class VespaClientWrapper implements VectorStoreAdapter {
  readonly provider = 'vespa' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: true,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: false,
    supportsMultiTenancy: true,
    supportsQuantization: true,
    supportsScan: true,
    maxBatchSize: 500,
    maxVectorDimension: 32768,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: VespaClientConfig;
  private initialized = false;

  constructor(config: VespaClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();
    const vectorStr = `[${options.vector.join(',')}]`;

    const yql = options.hybridQuery
      ? `select * from ${this.config.namespace}.${this.config.documentType} where ({targetHits: ${options.topK}}nearestNeighbor(embedding, q)) or userQuery(@query) limit ${options.topK}`
      : `select * from ${this.config.namespace}.${this.config.documentType} where ({targetHits: ${options.topK}}nearestNeighbor(embedding, q)) limit ${options.topK}`;

    const body: VespaSearchBody = {
      yql,
      hits: options.topK,
      'input.query(q)': vectorStr,
    };

    if (options.hybridQuery) {
      body.query = options.hybridQuery;
    }

    if (options.filter) {
      const whereClause = this.buildVespaFilter(options.filter);
      body.yql = `${body.yql} and ${whereClause}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.endpoint}/search/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Vespa search failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as VespaQueryResponse;
    const children = data?.root?.children ?? [];

    return children.map((child) => ({
      chunkId: child.id ?? '',
      documentId: (child.fields?.documentId as string) ?? '',
      content: (child.fields?.content as string) ?? '',
      score: child.relevance ?? 0,
      source: options.hybridQuery ? ('hybrid-native' as const) : ('vector' as const),
      metadata: (child.fields as Record<string, unknown>) ?? {},
    }));
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(
      `${this.config.endpoint}/document/v1/${this.config.namespace}/${this.config.documentType}/docid/${encodeURIComponent(point.id)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fields: {
            id: point.id,
            embedding: point.vector,
            documentId: point.payload?.documentId ?? '',
            content: point.payload?.content ?? '',
            ...point.payload,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Vespa upsert failed: ${response.status} ${response.statusText}`);
    }
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    const batchSize = this.capabilities.maxBatchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }
      for (const point of batch) {
        const response = await fetch(
          `${this.config.endpoint}/document/v1/${this.config.namespace}/${this.config.documentType}/docid/${encodeURIComponent(point.id)}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              fields: {
                id: point.id,
                embedding: point.vector,
                documentId: point.payload?.documentId ?? '',
                content: point.payload?.content ?? '',
                ...point.payload,
              },
            }),
          },
        );
        if (!response.ok) {
          throw new Error(`Vespa upsert failed for ${point.id}: ${response.status}`);
        }
      }
    }
  }

  async deleteCollection(_collectionName: string): Promise<void> {
    throw new Error(
      'Vespa does not support collection management via the adapter. Deploy schema externally.',
    );
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }
      const response = await fetch(`${this.config.endpoint}/search/`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yql: `select * from ${this.config.namespace}.${collectionName} where true limit 0`,
          hits: 0,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { root?: { fields?: { totalCount?: number } } };
        return {
          collectionName,
          vectorCount: data?.root?.fields?.totalCount ?? 0,
          vectorDimension: this.config.vectorDimension,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    return [this.config.documentType];
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/search/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yql: 'select * from sources * where true limit 0', hits: 0 }),
      });
      return response.ok;
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
    const continuation = options?.cursor ?? '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const body: VespaSearchBody = {
      yql: `select * from ${this.config.namespace}.${collectionName} where true limit ${limit}`,
      hits: limit,
    };

    if (continuation) {
      body.continuation = continuation;
    }

    const response = await fetch(`${this.config.endpoint}/search/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Vespa scan failed: ${response.status}`);
    }

    const data = (await response.json()) as VespaQueryResponse & { continuation?: string };
    const children = data?.root?.children ?? [];

    const points: VectorStorePoint[] = children.map((child) => ({
      id: child.id ?? '',
      vector: (child.fields?.embedding as number[]) ?? [],
      payload: {
        documentId: (child.fields?.documentId as string) ?? '',
        content: (child.fields?.content as string) ?? '',
        ...Object.fromEntries(
          Object.entries(child.fields ?? {}).filter(
            ([k]) => !['id', 'embedding', 'documentId', 'content'].includes(k),
          ),
        ),
      },
    }));

    return {
      points,
      nextCursor: data.continuation,
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('VespaClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildVespaFilter(filter: StandardFilter): string {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        return (filter.$and as StandardFilter[]).map((f) => this.buildVespaFilter(f)).join(' AND ');
      }
      if ('$or' in filter) {
        return `(${(filter.$or as StandardFilter[]).map((f) => this.buildVespaFilter(f)).join(' OR ')})`;
      }
    }

    const conditions: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (value === null || value === undefined) {
        conditions.push(`${key} is null`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) conditions.push(`${key} = ${this.vespaValue(op.$eq)}`);
        else if ('$ne' in op) conditions.push(`${key} != ${this.vespaValue(op.$ne)}`);
        else if ('$in' in op) {
          const arr = op.$in as (string | number)[];
          conditions.push(`${key} in [${arr.map((v) => this.vespaValue(v)).join(',')}]`);
        } else if ('$nin' in op) {
          const arr = op.$nin as (string | number)[];
          conditions.push(`!(${key} in [${arr.map((v) => this.vespaValue(v)).join(',')}])`);
        } else if ('$exists' in op) {
          conditions.push(op.$exists ? `${key} is not null` : `${key} is null`);
        } else if ('$gt' in op) conditions.push(`${key} > ${op.$gt}`);
        else if ('$gte' in op) conditions.push(`${key} >= ${op.$gte}`);
        else if ('$lt' in op) conditions.push(`${key} < ${op.$lt}`);
        else if ('$lte' in op) conditions.push(`${key} <= ${op.$lte}`);
      } else {
        conditions.push(`${key} = ${this.vespaValue(value)}`);
      }
    }

    return conditions.join(' AND ');
  }

  private vespaValue(value: unknown): string {
    if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
    if (value === null) return 'null';
    return String(value);
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

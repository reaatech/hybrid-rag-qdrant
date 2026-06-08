import type {
  HnswAlgorithmConfiguration,
  SearchField,
  SearchIndex,
  SearchIndexStatistics,
  SearchOptions,
  VectorizedQuery,
  VectorSearch,
} from '@azure/search-documents';
import { AzureKeyCredential, SearchClient, SearchIndexClient } from '@azure/search-documents';
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

export interface AzureAISearchClientConfig {
  endpoint: string;
  apiKey: string;
  indexName: string;
  vectorDimension: number;
}

interface AzureDoc {
  id: string;
  vector?: number[];
  payload?: Record<string, unknown>;
  content?: string;
}

export class AzureAISearchClientWrapper implements VectorStoreAdapter {
  readonly provider = 'azure-ai-search' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: true,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: false,
    supportsQuantization: true,
    supportsScan: true,
    maxBatchSize: 1000,
    maxVectorDimension: 4096,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: AzureAISearchClientConfig;
  private searchClient: SearchClient<AzureDoc> | null = null;
  private indexClient: SearchIndexClient | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: AzureAISearchClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    const credential = new AzureKeyCredential(this.config.apiKey);
    this.indexClient = new SearchIndexClient(this.config.endpoint, credential);
    this.searchClient = new SearchClient<AzureDoc>(
      this.config.endpoint,
      this.config.indexName,
      credential,
    );

    type VectorField = SearchField & {
      dimensions: number;
      vectorSearchProfile: string;
      searchable: boolean;
    };

    try {
      await this.indexClient.getIndex(this.config.indexName);
    } catch {
      const vectorField: VectorField = {
        name: 'vector',
        type: 'Collection(Edm.Single)',
        dimensions: this.config.vectorDimension,
        vectorSearchProfile: 'vector-profile',
        searchable: true,
      };
      const hnswAlgo: HnswAlgorithmConfiguration = {
        name: 'hnsw-config',
        kind: 'hnsw',
        parameters: { metric: 'cosine', m: 4, efConstruction: 400 },
      };
      const vectorSearch: VectorSearch = {
        algorithms: [hnswAlgo],
        profiles: [{ name: 'vector-profile', algorithmConfigurationName: 'hnsw-config' }],
      };
      const index: SearchIndex = {
        name: this.config.indexName,
        fields: [
          { name: 'id', type: 'Edm.String', key: true },
          vectorField,
          { name: 'payload', type: 'Edm.String', searchable: false },
          { name: 'content', type: 'Edm.String', searchable: true },
        ],
        vectorSearch,
      };
      await this.indexClient.createIndex(index);
    }

    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();

    const vectorQuery: VectorizedQuery<AzureDoc> = {
      kind: 'vector',
      vector: options.vector,
      fields: ['vector'],
      kNearestNeighborsCount: options.topK,
    };

    const searchOptions: SearchOptions<AzureDoc> = {
      top: options.topK,
      includeTotalCount: false,
      select: ['id', 'payload', 'content'],
      vectorSearchOptions: {
        queries: [vectorQuery],
      },
    };

    if (options.filter) {
      searchOptions.filter = this.buildODATAFilter(options.filter);
    }

    if (options.hybridQuery) {
      const searchResults = await this.searchClient!.search(options.hybridQuery, searchOptions);
      const results: RetrievalResult[] = [];
      for await (const result of searchResults.results) {
        const payload = this.parsePayload(result.document.payload);
        results.push({
          chunkId: result.document.id,
          documentId: (payload.documentId as string) ?? '',
          content: (payload.content as string) ?? '',
          score: result.score ?? 0,
          source: 'hybrid-native' as const,
          metadata: payload,
        });
      }
      return results;
    }

    const searchResults = await this.searchClient!.search('*', searchOptions);
    const results: RetrievalResult[] = [];
    for await (const result of searchResults.results) {
      const payload = this.parsePayload(result.document.payload);
      results.push({
        chunkId: result.document.id,
        documentId: (payload.documentId as string) ?? '',
        content: (payload.content as string) ?? '',
        score: result.score ?? 0,
        source: 'vector' as const,
        metadata: payload,
      });
    }
    return results;
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    this.ensureInitialized();
    await this.searchClient!.mergeOrUploadDocuments([
      {
        id: point.id,
        vector: point.vector,
        payload: point.payload as Record<string, unknown>,
        content: (point.payload?.content as string) ?? '',
      },
    ]);
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const batchSize = this.capabilities.maxBatchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const documents = batch.map((point) => ({
        id: point.id,
        vector: point.vector,
        payload: point.payload as Record<string, unknown>,
        content: (point.payload?.content as string) ?? '',
      }));
      await this.searchClient!.mergeOrUploadDocuments(documents);
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    try {
      await this.indexClient!.deleteIndex(collectionName);
    } catch {}
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const indexStats: SearchIndexStatistics =
        await this.indexClient!.getIndexStatistics(collectionName);
      return {
        collectionName,
        vectorCount: indexStats.documentCount,
        vectorDimension: this.config.vectorDimension,
      };
    } catch {
      return null;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const indexes = await this.indexClient!.listIndexes();
      const names: string[] = [];
      for await (const index of indexes) {
        names.push(index.name);
      }
      return names;
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.indexClient!.listIndexes();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {}

  async scanPoints(
    _collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    this.ensureInitialized();
    const top = options?.batchSize ?? 100;
    const skip = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const results = await this.searchClient!.search('*', {
      top,
      skip,
      select: ['id', 'vector', 'payload'],
      includeTotalCount: false,
    });

    const points: VectorStorePoint[] = [];
    for await (const result of results.results) {
      points.push({
        id: result.document.id,
        vector: result.document.vector ?? [],
        payload: this.parsePayload(result.document.payload),
      });
    }

    const nextSkip = skip + points.length;
    const nextCursor = points.length >= top ? String(nextSkip) : undefined;

    return { points, nextCursor };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.searchClient) {
      throw new Error('AzureAISearchClientWrapper not initialized. Call initialize() first.');
    }
  }

  private parsePayload(payload: unknown): Record<string, unknown> {
    if (!payload) return {};
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return { _raw: payload };
      }
    }
    return payload as Record<string, unknown>;
  }

  private buildODATAFilter(filter: StandardFilter): string {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        return (filter.$and as StandardFilter[]).map((f) => this.buildODATAFilter(f)).join(' and ');
      }
      if ('$or' in filter) {
        return `(${(filter.$or as StandardFilter[]).map((f) => this.buildODATAFilter(f)).join(' or ')})`;
      }
    }

    const conditions: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      const field = `payload/${key}`;
      if (value === null || value === undefined) {
        conditions.push(`${field} eq null`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) conditions.push(`${field} eq ${this.odataValue(op.$eq)}`);
        else if ('$ne' in op) conditions.push(`${field} ne ${this.odataValue(op.$ne)}`);
        else if ('$in' in op) {
          const arr = op.$in as (string | number)[];
          conditions.push(`(${arr.map((v) => `${field} eq ${this.odataValue(v)}`).join(' or ')})`);
        } else if ('$nin' in op) {
          const arr = op.$nin as (string | number)[];
          conditions.push(
            `(not (${arr.map((v) => `${field} eq ${this.odataValue(v)}`).join(' or ')}))`,
          );
        } else if ('$exists' in op) {
          conditions.push(op.$exists ? `${field} ne null` : `${field} eq null`);
        } else if ('$gt' in op) conditions.push(`${field} gt ${op.$gt}`);
        else if ('$gte' in op) conditions.push(`${field} ge ${op.$gte}`);
        else if ('$lt' in op) conditions.push(`${field} lt ${op.$lt}`);
        else if ('$lte' in op) conditions.push(`${field} le ${op.$lte}`);
      } else {
        conditions.push(`${field} eq ${this.odataValue(value)}`);
      }
    }

    return conditions.join(' and ');
  }

  private odataValue(value: unknown): string {
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (value === null) return 'null';
    return String(value);
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

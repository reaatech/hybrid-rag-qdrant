import type { RetrievalResult } from './domain.js';

export type VectorStoreProvider =
  | 'qdrant'
  | 'pinecone'
  | 'weaviate'
  | 'chroma'
  | 'pgvector'
  | 'milvus'
  | 'elasticsearch'
  | 'opensearch'
  | 'redis'
  | 'mongodb'
  | 'azure-ai-search'
  | 'lancedb'
  | 'vespa'
  | 'supabase'
  | 'sandbox';

export interface VectorStorePoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
  sparseVector?: SparseVector;
}

export type StandardFilterValue = string | number | boolean | null | string[] | number[];

export type StandardFilterOperator =
  | { $eq: StandardFilterValue }
  | { $ne: StandardFilterValue }
  | { $in: (string | number)[] }
  | { $nin: (string | number)[] }
  | { $gt: number }
  | { $gte: number }
  | { $lt: number }
  | { $lte: number }
  | { $exists: boolean };

export type StandardFilter =
  | Record<string, StandardFilterOperator | StandardFilterValue>
  | { $and: StandardFilter[] }
  | { $or: StandardFilter[] };

export interface VectorStoreSearchOptions {
  vector: number[];
  topK: number;
  filter?: StandardFilter;
  collection?: string;
  hybridQuery?: string;
  hybridAlpha?: number;
  sparseVector?: SparseVector;
}

export interface SparseVector {
  indices: number[];
  values: number[];
}

export interface VectorStoreCapabilities {
  supportsHybridSearch: boolean;
  supportsMetadataFiltering: boolean;
  supportsBatchUpsert: boolean;
  supportsCollectionManagement: boolean;
  supportsMultiTenancy: boolean;
  supportsQuantization: boolean;
  supportsScan: boolean;
  maxBatchSize: number;
  maxVectorDimension: number;
}

export interface VectorStoreCostModel {
  costPerQueryEstimate: number;
  costPer1000Upserts: number;
  monthlyBaseCost?: number;
}

export interface VectorStoreStats {
  collectionName: string;
  vectorCount: number;
  vectorDimension: number;
  indexType?: string;
  diskUsageBytes?: number;
}

export interface VectorStoreAdapter {
  readonly provider: VectorStoreProvider;
  readonly capabilities: VectorStoreCapabilities;
  readonly costModel: VectorStoreCostModel;

  initialize(): Promise<void>;
  search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]>;
  upsertPoint(point: VectorStorePoint): Promise<void>;
  upsertBatch(points: VectorStorePoint[]): Promise<void>;
  deleteCollection(collectionName: string): Promise<void>;
  getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null>;
  listCollections(): Promise<string[]>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;

  scanPoints?(
    collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }>;
}

export type VectorStoreConfig =
  | {
      provider: 'qdrant';
      url: string;
      apiKey?: string;
      collectionName: string;
      vectorSize: number;
      distance?: 'Cosine' | 'Euclid' | 'Dot';
    }
  | {
      provider: 'pinecone';
      apiKey: string;
      indexName: string;
      cloud?: string;
      region?: string;
      namespace?: string;
    }
  | {
      provider: 'weaviate';
      url: string;
      apiKey?: string;
      className: string;
      tenant?: string;
    }
  | {
      provider: 'chroma';
      url?: string;
      collectionName: string;
      tenant?: string;
    }
  | {
      provider: 'pgvector';
      connectionString: string;
      tableName: string;
      vectorDimension: number;
      schema?: string;
    }
  | {
      provider: 'milvus';
      address: string;
      token?: string;
      collectionName: string;
      vectorDimension: number;
      database?: string;
    }
  | {
      provider: 'elasticsearch';
      node: string;
      apiKey?: string;
      username?: string;
      password?: string;
      indexName: string;
      vectorDimension: number;
    }
  | {
      provider: 'opensearch';
      node: string;
      apiKey?: string;
      username?: string;
      password?: string;
      indexName: string;
      vectorDimension: number;
    }
  | {
      provider: 'redis';
      url: string;
      indexName: string;
      vectorDimension: number;
      keyPrefix?: string;
    }
  | {
      provider: 'mongodb';
      connectionString: string;
      databaseName: string;
      collectionName: string;
      vectorIndexName: string;
      vectorDimension: number;
    }
  | {
      provider: 'azure-ai-search';
      endpoint: string;
      apiKey: string;
      indexName: string;
      vectorDimension: number;
    }
  | {
      provider: 'lancedb';
      uri: string;
      tableName: string;
      vectorDimension: number;
    }
  | {
      provider: 'vespa';
      endpoint: string;
      namespace: string;
      documentType: string;
      vectorDimension: number;
      apiKey?: string;
    }
  | {
      provider: 'supabase';
      url: string;
      serviceRoleKey: string;
      tableName: string;
      vectorDimension: number;
      schema?: string;
    }
  | {
      provider: 'sandbox';
      collectionName?: string;
    };

export class VectorStoreOperationError extends Error {
  constructor(
    message: string,
    public readonly provider: VectorStoreProvider,
    public readonly operation: string,
  ) {
    super(message);
    this.name = 'VectorStoreOperationError';
  }
}

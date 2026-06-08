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
import type { Collection, Document } from 'mongodb';
import { MongoClient } from 'mongodb';

export interface MongoDBVectorClientConfig {
  connectionString: string;
  databaseName: string;
  collectionName: string;
  vectorIndexName: string;
  vectorDimension: number;
}

export class MongoDBVectorClientWrapper implements VectorStoreAdapter {
  readonly provider = 'mongodb' as const;
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: false,
    supportsMetadataFiltering: true,
    supportsBatchUpsert: true,
    supportsCollectionManagement: true,
    supportsMultiTenancy: true,
    supportsQuantization: true,
    supportsScan: true,
    maxBatchSize: 1000,
    maxVectorDimension: 4096,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
  };

  private readonly config: MongoDBVectorClientConfig;
  private client: MongoClient | null = null;
  private collection: Collection<Document> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: MongoDBVectorClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    this.client = new MongoClient(this.config.connectionString);
    await this.client.connect();
    const db = this.client.db(this.config.databaseName);
    this.collection = db.collection(this.config.collectionName);

    interface CreateSearchIndex {
      createIndexes: string;
      indexes: {
        name: string;
        key: Record<string, string>;
        vectorIndex: {
          type: string;
          field: string;
          dimensions: number;
          similarity: string;
        };
      }[];
    }

    try {
      const indexSpec: CreateSearchIndex = {
        createIndexes: this.config.collectionName,
        indexes: [
          {
            name: this.config.vectorIndexName,
            key: { vector: 'vectorIndex' },
            vectorIndex: {
              type: 'vectorIndex',
              field: 'vector',
              dimensions: this.config.vectorDimension,
              similarity: 'cosine',
            },
          },
        ],
      };
      await db.command(indexSpec);
    } catch {
      // Index may already exist
    }

    this.initialized = true;
  }

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    this.ensureInitialized();

    const pipeline: Document[] = [
      {
        $vectorSearch: {
          queryVector: options.vector,
          path: 'vector',
          numCandidates: options.topK * 3,
          limit: options.topK,
          index: this.config.vectorIndexName,
        },
      },
      {
        $project: {
          _id: 0,
          chunkId: '$_id',
          documentId: { $ifNull: ['$payload.documentId', ''] },
          content: { $ifNull: ['$payload.content', ''] },
          score: { $meta: 'vectorSearchScore' },
          metadata: '$payload',
        },
      },
    ];

    if (options.filter) {
      pipeline.splice(1, 0, { $match: this.buildMongoFilter(options.filter) });
    }

    const results = await this.collection!.aggregate(pipeline).toArray();
    return results.map((doc) => ({
      chunkId: String(doc.chunkId ?? ''),
      documentId: doc.documentId ?? '',
      content: doc.content ?? '',
      score: doc.score ?? 0,
      source: 'vector' as const,
      metadata: (doc.metadata as Record<string, unknown>) ?? {},
    }));
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    this.ensureInitialized();
    await this.collection!.updateOne(
      { _id: point.id } as Record<string, unknown>,
      {
        $set: {
          vector: point.vector,
          payload: point.payload,
        },
      },
      { upsert: true },
    );
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    this.ensureInitialized();
    const batchSize = this.capabilities.maxBatchSize;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      type BulkWriteOperation = {
        updateOne: {
          filter: Record<string, unknown>;
          update: Record<string, unknown>;
          upsert: boolean;
        };
      };

      const operations: BulkWriteOperation[] = batch.map((point) => ({
        updateOne: {
          filter: { _id: point.id },
          update: {
            $set: {
              vector: point.vector,
              payload: point.payload,
            },
          },
          upsert: true,
        },
      }));
      await this.collection!.bulkWrite(operations, { ordered: false });
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    this.ensureInitialized();
    const coll = collectionName
      ? this.client!.db(this.config.databaseName).collection(collectionName)
      : this.collection!;
    await coll.drop();
  }

  async getCollectionInfo(collectionName: string): Promise<VectorStoreStats | null> {
    try {
      const coll = collectionName
        ? this.client!.db(this.config.databaseName).collection(collectionName)
        : this.collection!;
      const count = await coll.countDocuments();
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
      const db = this.client!.db(this.config.databaseName);
      const collections = await db.listCollections().toArray();
      return collections.map((c) => c.name);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client!.db('admin').command({ ping: 1 });
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
    const limit = options?.batchSize ?? 100;
    const filter: Document = {};

    if (options?.cursor) {
      filter._id = { $gt: options.cursor };
    }

    const coll = collectionName
      ? this.client!.db(this.config.databaseName).collection(collectionName)
      : this.collection!;
    const docs = await coll.find(filter).sort({ _id: 1 }).limit(limit).toArray();

    const points: VectorStorePoint[] = docs.map((doc) => ({
      id: String(doc._id),
      vector: doc.vector ?? [],
      payload: doc.payload ?? {},
    }));

    const nextCursor = points.length === limit ? String(docs[docs.length - 1]._id) : undefined;

    return { points, nextCursor };
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.collection) {
      throw new Error('MongoDBVectorClientWrapper not initialized. Call initialize() first.');
    }
  }

  private buildMongoFilter(filter: StandardFilter): Document {
    if (this.isLogicalFilter(filter)) {
      if ('$and' in filter) {
        return { $and: (filter.$and as StandardFilter[]).map((f) => this.buildMongoFilter(f)) };
      }
      if ('$or' in filter) {
        return { $or: (filter.$or as StandardFilter[]).map((f) => this.buildMongoFilter(f)) };
      }
    }

    const mongoFilter: Document = {};
    for (const [key, value] of Object.entries(filter)) {
      const field = `payload.${key}`;

      if (value === null || value === undefined) {
        mongoFilter[field] = { $eq: null };
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const op = value as StandardFilterOperator;
        if ('$eq' in op) mongoFilter[field] = op.$eq;
        else if ('$ne' in op) mongoFilter[field] = { $ne: op.$ne };
        else if ('$in' in op) mongoFilter[field] = { $in: op.$in };
        else if ('$nin' in op) mongoFilter[field] = { $nin: op.$nin };
        else if ('$gt' in op) mongoFilter[field] = { $gt: op.$gt };
        else if ('$gte' in op) mongoFilter[field] = { $gte: op.$gte };
        else if ('$lt' in op) mongoFilter[field] = { $lt: op.$lt };
        else if ('$lte' in op) mongoFilter[field] = { $lte: op.$lte };
        else if ('$exists' in op) {
          if (op.$exists) mongoFilter[field] = { $exists: true };
          else mongoFilter[field] = { $exists: false };
        }
      } else {
        mongoFilter[field] = value;
      }
    }

    return mongoFilter;
  }

  private isLogicalFilter(filter: StandardFilter): boolean {
    return '$and' in filter || '$or' in filter;
  }
}

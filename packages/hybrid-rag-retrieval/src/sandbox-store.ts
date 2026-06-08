import type {
  RetrievalResult,
  VectorStoreAdapter,
  VectorStoreCapabilities,
  VectorStoreCostModel,
  VectorStorePoint,
  VectorStoreSearchOptions,
  VectorStoreStats,
} from '@reaatech/hybrid-rag';

export class SandboxVectorStore implements VectorStoreAdapter {
  readonly provider = 'sandbox';
  readonly capabilities: VectorStoreCapabilities = {
    supportsHybridSearch: false,
    supportsMetadataFiltering: false,
    supportsBatchUpsert: true,
    supportsCollectionManagement: false,
    supportsMultiTenancy: false,
    supportsQuantization: false,
    supportsScan: true,
    maxBatchSize: 1000,
    maxVectorDimension: 10000,
  };
  readonly costModel: VectorStoreCostModel = {
    costPerQueryEstimate: 0,
    costPer1000Upserts: 0,
    monthlyBaseCost: 0,
  };

  private points: VectorStorePoint[] = [];

  constructor(
    private readonly config: {
      collectionName?: string;
    },
  ) {}

  async initialize(): Promise<void> {}

  async search(options: VectorStoreSearchOptions): Promise<RetrievalResult[]> {
    const { vector, topK } = options;
    const scored = this.points.map((point) => ({
      chunkId: point.id,
      documentId: (point.payload?.documentId as string) ?? '',
      content: (point.payload?.content as string) ?? '',
      score: cosineSimilarity(vector, point.vector),
      source: 'vector' as const,
      metadata: point.payload,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async upsertPoint(point: VectorStorePoint): Promise<void> {
    const idx = this.points.findIndex((p) => p.id === point.id);
    if (idx >= 0) {
      this.points[idx] = point;
    } else {
      this.points.push(point);
    }
  }

  async upsertBatch(points: VectorStorePoint[]): Promise<void> {
    for (const point of points) {
      await this.upsertPoint(point);
    }
  }

  async deleteCollection(_collectionName: string): Promise<void> {
    this.points = [];
  }

  async getCollectionInfo(_collectionName: string): Promise<VectorStoreStats | null> {
    if (this.points.length === 0) return null;
    return {
      collectionName: this.config.collectionName ?? 'sandbox',
      vectorCount: this.points.length,
      vectorDimension: this.points[0]!.vector.length,
    };
  }

  async listCollections(): Promise<string[]> {
    if (!this.config.collectionName) return [];
    return [this.config.collectionName];
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  async scanPoints(
    _collectionName: string,
    options?: { batchSize?: number; cursor?: string },
  ): Promise<{ points: VectorStorePoint[]; nextCursor?: string }> {
    const batchSize = options?.batchSize ?? 100;
    const cursor = options?.cursor;
    const startIdx = cursor ? parseInt(cursor, 10) : 0;
    const batch = this.points.slice(startIdx, startIdx + batchSize);
    const nextCursorVal =
      startIdx + batchSize < this.points.length ? String(startIdx + batchSize) : undefined;
    return { points: batch, nextCursor: nextCursorVal };
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

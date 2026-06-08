import type { Chunk, VectorStoreAdapter } from '@reaatech/hybrid-rag';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { embedMock, embedBatchMock, getDimensionMock, createVectorStoreMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
  embedBatchMock: vi.fn(),
  getDimensionMock: vi.fn().mockReturnValue(1536),
  createVectorStoreMock: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag-embedding', () => {
  class EmbeddingService {
    static getDimension = getDimensionMock;
    embed = embedMock;
    embedBatch = embedBatchMock;
  }
  return { EmbeddingService };
});

vi.mock('./vector-store-factory.js', () => ({
  createVectorStore: createVectorStoreMock,
}));

import { VectorSearchEngine } from './vector-search.js';

function makeAdapter(overrides: Partial<VectorStoreAdapter> = {}): VectorStoreAdapter {
  return {
    provider: 'sandbox',
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: false,
      supportsBatchUpsert: true,
      supportsCollectionManagement: false,
      supportsMultiTenancy: false,
      supportsQuantization: false,
      supportsScan: true,
      maxBatchSize: 1000,
      maxVectorDimension: 10000,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0, monthlyBaseCost: 0 },
    initialize: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    upsertPoint: vi.fn(),
    upsertBatch: vi.fn().mockResolvedValue(undefined),
    deleteCollection: vi.fn(),
    getCollectionInfo: vi.fn(),
    listCollections: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as VectorStoreAdapter;
}

function chunk(id: string, content: string): Chunk {
  return {
    id,
    documentId: `doc-${id}`,
    index: 0,
    content,
    tokenCount: 3,
    characterCount: content.length,
    startPosition: 0,
    endPosition: content.length,
    metadata: { tag: id },
    strategy: 'fixed' as Chunk['strategy'],
  };
}

const baseConfig = {
  vectorStore: { provider: 'sandbox' as const },
  embedding: { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'k' } as never,
};

describe('VectorSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDimensionMock.mockReturnValue(1536);
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    embedBatchMock.mockResolvedValue([
      { embedding: [0.1, 0.2, 0.3] },
      { embedding: [0.4, 0.5, 0.6] },
    ]);
  });

  it('uses injected adapter without calling factory in initialize', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    expect(createVectorStoreMock).not.toHaveBeenCalled();
    expect(adapter.initialize).toHaveBeenCalled();
    expect(engine.getVectorStore()).toBe(adapter);
  });

  it('creates adapter via factory when none injected (deferred async)', async () => {
    const adapter = makeAdapter({ provider: 'qdrant' });
    createVectorStoreMock.mockResolvedValue(adapter);
    const engine = new VectorSearchEngine(baseConfig);
    await engine.initialize();
    expect(createVectorStoreMock).toHaveBeenCalledWith(baseConfig.vectorStore);
    expect(engine.getCapabilities().supportsHybridSearch).toBe(false);
  });

  it('throws when used before initialize', () => {
    const engine = new VectorSearchEngine(baseConfig);
    expect(() => engine.getCapabilities()).toThrow('not initialized');
    expect(() => engine.getVectorStore()).toThrow('not initialized');
  });

  it('indexChunks builds points without sparse vectors when hybrid unsupported', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await engine.indexChunks([chunk('1', 'one'), chunk('2', 'two')]);

    expect(embedBatchMock).toHaveBeenCalledWith(['one', 'two']);
    const points = (adapter.upsertBatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(points).toHaveLength(2);
    expect(points[0].id).toBe('1');
    expect(points[0].vector).toEqual([0.1, 0.2, 0.3]);
    expect(points[0].payload.documentId).toBe('doc-1');
    expect(points[0].sparseVector).toBeUndefined();
  });

  it('indexChunks attaches sparse vectors when hybrid supported', async () => {
    const adapter = makeAdapter({
      capabilities: { ...makeAdapter().capabilities, supportsHybridSearch: true },
    });
    embedBatchMock.mockResolvedValueOnce([{ embedding: [0.1, 0.2, 0.3] }]);
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await engine.indexChunks([chunk('1', 'hello world')]);
    const points = (adapter.upsertBatch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(points[0].sparseVector).toBeDefined();
  });

  it('indexChunks throws when an embedding is empty', async () => {
    embedBatchMock.mockResolvedValue([{ embedding: [] }]);
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await expect(engine.indexChunks([chunk('1', 'one')])).rejects.toThrow(
      'Failed to generate embedding for chunk 1',
    );
  });

  it('indexChunks throws when embedding result missing', async () => {
    embedBatchMock.mockResolvedValue([undefined]);
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await expect(engine.indexChunks([chunk('1', 'one')])).rejects.toThrow(
      'Failed to generate embedding for chunk 1',
    );
  });

  it('embedQuery returns the embedding', async () => {
    const engine = new VectorSearchEngine(baseConfig, makeAdapter());
    await engine.initialize();
    expect(await engine.embedQuery('hi')).toEqual([0.1, 0.2, 0.3]);
  });

  it('search embeds query and delegates with default topK', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await engine.search('hello');
    expect(adapter.search).toHaveBeenCalledWith({
      vector: [0.1, 0.2, 0.3],
      topK: 10,
      filter: undefined,
    });
  });

  it('search honors topK and filter options', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine({ ...baseConfig, topK: 5 }, adapter);
    await engine.initialize();
    const filter = { must: [] } as never;
    await engine.search('hello', { topK: 3, filter });
    expect(adapter.search).toHaveBeenCalledWith({
      vector: [0.1, 0.2, 0.3],
      topK: 3,
      filter,
    });
  });

  it('searchByVector delegates directly with provided vector', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await engine.searchByVector([9, 9, 9], { topK: 2 });
    expect(adapter.search).toHaveBeenCalledWith({ vector: [9, 9, 9], topK: 2, filter: undefined });
  });

  it('searchByVector uses default topK when no options given', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await engine.searchByVector([1, 1, 1]);
    expect(adapter.search).toHaveBeenCalledWith({
      vector: [1, 1, 1],
      topK: 10,
      filter: undefined,
    });
  });

  it('searchWithHybrid passes hybrid query and alpha', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await engine.searchWithHybrid('q', [1, 2, 3], { topK: 4, hybridAlpha: 0.6 });
    expect(adapter.search).toHaveBeenCalledWith({
      vector: [1, 2, 3],
      topK: 4,
      filter: undefined,
      hybridQuery: 'q',
      hybridAlpha: 0.6,
    });
  });

  it('searchWithHybrid uses default topK when not given', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await engine.searchWithHybrid('q', [1, 2, 3]);
    expect((adapter.search as ReturnType<typeof vi.fn>).mock.calls[0]![0].topK).toBe(10);
  });

  it('healthCheck delegates to adapter', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    expect(await engine.healthCheck()).toBe(true);
  });

  it('close releases the adapter and is idempotent', async () => {
    const adapter = makeAdapter();
    const engine = new VectorSearchEngine(baseConfig, adapter);
    await engine.initialize();
    await engine.close();
    expect(adapter.close).toHaveBeenCalled();
    await engine.close(); // no-op when already null
    expect(() => engine.getVectorStore()).toThrow('not initialized');
  });
});

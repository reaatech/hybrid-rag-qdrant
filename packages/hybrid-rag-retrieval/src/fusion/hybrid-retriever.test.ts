import type { Chunk, RetrievalResult, VectorStoreAdapter } from '@reaatech/hybrid-rag';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { embedMock, embedBatchMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
  embedBatchMock: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag-embedding', () => {
  class EmbeddingService {
    static getDimension = vi.fn().mockReturnValue(1536);
    embed = embedMock;
    embedBatch = embedBatchMock;
  }
  return { EmbeddingService };
});

vi.mock('../vector-store-factory.js', () => ({
  createVectorStore: vi.fn(),
}));

import { HybridRetriever } from './hybrid-retriever.js';

function makeAdapter(supportsHybridSearch: boolean): VectorStoreAdapter {
  return {
    provider: 'sandbox',
    capabilities: {
      supportsHybridSearch,
      supportsMetadataFiltering: true,
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
    search: vi.fn().mockResolvedValue([] as RetrievalResult[]),
    upsertPoint: vi.fn(),
    upsertBatch: vi.fn().mockResolvedValue(undefined),
    deleteCollection: vi.fn(),
    getCollectionInfo: vi.fn(),
    listCollections: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
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
    metadata: {},
    strategy: 'fixed' as Chunk['strategy'],
  };
}

function vr(chunkId: string, score: number, source: 'vector' | 'bm25'): RetrievalResult {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    content: `learning content ${chunkId}`,
    score,
    source,
    metadata: {},
  };
}

const config = {
  vector: {
    vectorStore: { provider: 'sandbox' as const },
    embedding: { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'k' } as never,
  },
  bm25: {},
  fusion: { strategy: 'weighted-sum' as const },
  topK: 5,
};

describe('HybridRetriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    embedBatchMock.mockResolvedValue([{ embedding: [0.1, 0.2, 0.3] }]);
  });

  it('initialize sets initialized flag', async () => {
    const retriever = new HybridRetriever(config, makeAdapter(false));
    expect(retriever.isInitialized()).toBe(false);
    await retriever.initialize();
    expect(retriever.isInitialized()).toBe(true);
  });

  it('indexChunks indexes both vector and bm25', async () => {
    const adapter = makeAdapter(false);
    const retriever = new HybridRetriever(config, adapter);
    await retriever.initialize();
    await retriever.indexChunks([chunk('1', 'machine learning')]);
    expect(adapter.upsertBatch).toHaveBeenCalled();
    const stats = await retriever.getStats();
    expect(stats.totalChunks).toBe(1);
    expect(stats.bm25Stats.totalDocuments).toBe(1);
  });

  it('retrieve in vector mode delegates to vector search', async () => {
    const adapter = makeAdapter(false);
    (adapter.search as ReturnType<typeof vi.fn>).mockResolvedValue([vr('a', 1, 'vector')]);
    const retriever = new HybridRetriever(config, adapter);
    await retriever.initialize();
    const out = await retriever.retrieve('q', { retrievalMode: 'vector' });
    expect(out[0]!.source).toBe('vector');
    expect(adapter.search).toHaveBeenCalled();
  });

  it('retrieve in bm25 mode delegates to bm25 search', async () => {
    const adapter = makeAdapter(false);
    const retriever = new HybridRetriever(config, adapter);
    await retriever.initialize();
    await retriever.indexChunks([chunk('1', 'learning algorithms')]);
    const out = await retriever.retrieve('learning', { retrievalMode: 'bm25' });
    expect(out[0]!.source).toBe('bm25');
    // vector adapter.search not used for bm25 mode
    expect(adapter.search).not.toHaveBeenCalled();
  });

  it('hybrid mode delegates natively when adapter supports hybrid search', async () => {
    const adapter = makeAdapter(true);
    (adapter.search as ReturnType<typeof vi.fn>).mockResolvedValue([vr('a', 1, 'vector')]);
    const retriever = new HybridRetriever(config, adapter);
    await retriever.initialize();
    const out = await retriever.retrieve('learning', { vectorWeight: 0.8 });
    expect(out).toHaveLength(1);
    const callArg = (adapter.search as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg.hybridQuery).toBe('learning');
    expect(callArg.hybridAlpha).toBe(0.8);
  });

  it('hybrid mode falls back to client-side fusion when not supported', async () => {
    const adapter = makeAdapter(false);
    (adapter.search as ReturnType<typeof vi.fn>).mockResolvedValue([vr('a', 0.9, 'vector')]);
    const retriever = new HybridRetriever(config, adapter);
    await retriever.initialize();
    await retriever.indexChunks([chunk('a', 'learning content a')]);
    const out = await retriever.retrieve('learning', { topK: 3 });
    // adapter.search called with topK*2 (fetch wider for fusion)
    const callArg = (adapter.search as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg.topK).toBe(6);
    expect(Array.isArray(out)).toBe(true);
  });

  it('hybrid fusion uses default weights when none provided', async () => {
    const adapter = makeAdapter(false);
    (adapter.search as ReturnType<typeof vi.fn>).mockResolvedValue([vr('a', 0.9, 'vector')]);
    const retriever = new HybridRetriever(config, adapter);
    await retriever.initialize();
    await retriever.indexChunks([chunk('a', 'learning content a')]);
    const out = await retriever.retrieve('learning');
    expect(Array.isArray(out)).toBe(true);
  });

  it('getStats returns zeros before any indexing', async () => {
    const retriever = new HybridRetriever(config, makeAdapter(false));
    const stats = await retriever.getStats();
    expect(stats.totalChunks).toBe(0);
    expect(stats.bm25Stats.avgDocLength).toBe(0);
  });

  it('exposes fusion and vector engines', async () => {
    const retriever = new HybridRetriever(config, makeAdapter(false));
    expect(retriever.getFusionEngine()).toBeDefined();
    expect(retriever.getVectorSearchEngine()).toBeDefined();
  });

  it('close resets initialized flag', async () => {
    const adapter = makeAdapter(false);
    const retriever = new HybridRetriever(config, adapter);
    await retriever.initialize();
    await retriever.close();
    expect(retriever.isInitialized()).toBe(false);
    expect(adapter.close).toHaveBeenCalled();
  });

  it('uses default topK of 10 when config.topK absent', async () => {
    const adapter = makeAdapter(false);
    (adapter.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { topK: _omit, ...noTopK } = config;
    const retriever = new HybridRetriever(noTopK, adapter);
    await retriever.initialize();
    await retriever.retrieve('q', { retrievalMode: 'vector' });
    expect((adapter.search as ReturnType<typeof vi.fn>).mock.calls[0]![0].topK).toBe(10);
  });
});

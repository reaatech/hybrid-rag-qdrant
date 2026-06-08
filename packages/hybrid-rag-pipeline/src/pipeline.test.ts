import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock state holders so individual tests can inspect/override behavior.
// A callable mock alias keeps `state.fn(...args)` type-checkable (the bare
// `ReturnType<typeof vi.fn>` resolves to a non-callable union under TS).
// ---------------------------------------------------------------------------

type MockFn = Mock<(...args: unknown[]) => unknown>;

interface FakeVectorStore {
  provider: string;
  capabilities: unknown;
  costModel: unknown;
  initialize: MockFn;
  listCollections: MockFn;
  getCollectionInfo: MockFn;
  healthCheck: MockFn;
  close: MockFn;
}

interface FakeRetriever {
  initialize: MockFn;
  indexChunks: MockFn;
  retrieve: MockFn;
  getStats: MockFn;
  close: MockFn;
}

const state: {
  vectorStore: FakeVectorStore;
  retriever: FakeRetriever;
  createVectorStore: MockFn;
  hybridRetrieverCtor: MockFn;
  lastRetrieverConfig: unknown;
  rerankerCtor: MockFn;
  lastRerankerConfig: unknown;
  rerankResults: MockFn;
  chunkDocument: MockFn;
  getDimension: MockFn;
  contextPlanner: {
    clear: MockFn;
    add: MockFn;
    pack: MockFn;
  };
  contextPlannerCtor: MockFn;
  lastPlannerOptions: unknown;
  createRAGChunk: MockFn;
  createTokenizer: MockFn;
  createStrategy: MockFn;
} = {} as never;

function makeVectorStore(): FakeVectorStore {
  return {
    provider: 'lancedb',
    capabilities: { supportsHybrid: true, name: 'lancedb-caps' },
    costModel: { perQuery: 0.001 },
    initialize: vi.fn().mockResolvedValue(undefined),
    listCollections: vi.fn().mockResolvedValue(['documents']),
    getCollectionInfo: vi.fn().mockResolvedValue({
      name: 'documents',
      vectorCount: 5,
      provider: 'lancedb',
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRetriever(): FakeRetriever {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    indexChunks: vi.fn().mockResolvedValue(undefined),
    retrieve: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({
      totalChunks: 3,
      bm25Stats: { totalDocuments: 2 },
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@reaatech/hybrid-rag', () => ({
  ChunkingStrategy: {
    FIXED_SIZE: 'fixed-size',
    SEMANTIC: 'semantic',
  },
}));

vi.mock('@reaatech/hybrid-rag-embedding', () => ({
  EmbeddingService: {
    getDimension: (...args: unknown[]) => state.getDimension(...args),
  },
}));

vi.mock('@reaatech/hybrid-rag-ingestion', () => ({
  chunkDocument: (...args: unknown[]) => state.chunkDocument(...args),
}));

vi.mock('@reaatech/hybrid-rag-retrieval', () => ({
  createVectorStore: (...args: unknown[]) => state.createVectorStore(...args),
  HybridRetriever: class {
    constructor(config: unknown, store: unknown) {
      state.lastRetrieverConfig = config;
      state.hybridRetrieverCtor(config, store);
      // Delegate every method/property to the shared fake retriever so
      // tests can inspect and override behavior per-case.
      Object.assign(this, state.retriever);
    }
  },
  RerankerEngine: class {
    rerankResults: (...args: unknown[]) => unknown;
    constructor(config: unknown) {
      state.lastRerankerConfig = config;
      state.rerankerCtor(config);
      this.rerankResults = (...args: unknown[]) => state.rerankResults(...args);
    }
  },
}));

vi.mock('@reaatech/context-window-planner', () => ({
  ContextPlanner: class {
    clear: (...args: unknown[]) => unknown;
    add: (...args: unknown[]) => unknown;
    pack: (...args: unknown[]) => unknown;
    constructor(options: unknown) {
      state.lastPlannerOptions = options;
      state.contextPlannerCtor(options);
      this.clear = (...a: unknown[]) => state.contextPlanner.clear(...a);
      this.add = (...a: unknown[]) => state.contextPlanner.add(...a);
      this.pack = (...a: unknown[]) => state.contextPlanner.pack(...a);
    }
  },
  createRAGChunk: (...args: unknown[]) => state.createRAGChunk(...args),
  createTokenizer: (...args: unknown[]) => state.createTokenizer(...args),
  createStrategy: (...args: unknown[]) => state.createStrategy(...args),
}));

// Import AFTER mocks are registered (vi.mock is hoisted).
import { RAGPipeline } from './pipeline.js';

beforeEach(() => {
  state.vectorStore = makeVectorStore();
  state.retriever = makeRetriever();
  state.createVectorStore = vi.fn().mockImplementation(async () => state.vectorStore);
  state.hybridRetrieverCtor = vi.fn();
  state.rerankerCtor = vi.fn();
  state.rerankResults = vi.fn().mockResolvedValue([]);
  state.chunkDocument = vi
    .fn()
    .mockImplementation(async (content: string, id: string) => [
      { id: `${id}-0`, content, documentId: id },
    ]);
  state.getDimension = vi.fn().mockReturnValue(1536);
  state.contextPlanner = {
    clear: vi.fn(),
    add: vi.fn(),
    pack: vi.fn().mockReturnValue({ items: [], totalTokens: 0 }),
  };
  state.contextPlannerCtor = vi.fn();
  state.createRAGChunk = vi.fn().mockImplementation((props) => ({ rag: props }));
  state.createTokenizer = vi.fn().mockReturnValue({ name: 'tok' });
  state.createStrategy = vi.fn().mockReturnValue({ name: 'strat' });
});

// ---------------------------------------------------------------------------
// normalizeConfig + constructor defaults
// ---------------------------------------------------------------------------

describe('RAGPipeline config normalization', () => {
  it('applies the LanceDB zero-config default when no vector store is given', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();

    expect(state.getDimension).toHaveBeenCalledWith('text-embedding-3-small');
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).toMatchObject({
      provider: 'lancedb',
      uri: '.lancedb-data',
      tableName: 'documents',
      vectorDimension: 1536,
    });
  });

  it('uses the embeddingModel to derive the vector dimension default', async () => {
    state.getDimension.mockReturnValue(3072);
    const pipeline = new RAGPipeline({ embeddingModel: 'text-embedding-3-large' });
    await pipeline.initialize();
    expect(state.getDimension).toHaveBeenCalledWith('text-embedding-3-large');
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg.vectorDimension).toBe(3072);
  });

  it('translates the legacy qdrantUrl/qdrantApiKey shim into a qdrant vector store config', async () => {
    const pipeline = new RAGPipeline({
      qdrantUrl: 'http://localhost:6333',
      qdrantApiKey: 'secret-key',
      collectionName: 'my-collection',
    } as never);
    await pipeline.initialize();

    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).toMatchObject({
      provider: 'qdrant',
      url: 'http://localhost:6333',
      apiKey: 'secret-key',
      collectionName: 'my-collection',
      vectorSize: 1536,
    });
  });

  it('legacy shim defaults the collection name to "documents"', async () => {
    const pipeline = new RAGPipeline({ qdrantUrl: 'http://localhost:6333' } as never);
    await pipeline.initialize();
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg.collectionName).toBe('documents');
    expect(cfg.apiKey).toBeUndefined();
  });

  it('does not apply the legacy shim when an explicit vectorStore is provided', async () => {
    const vectorStore = {
      provider: 'qdrant',
      url: 'http://explicit:6333',
      collectionName: 'explicit',
      vectorSize: 768,
    };
    const pipeline = new RAGPipeline({
      vectorStore: vectorStore as never,
      qdrantUrl: 'http://legacy:6333',
    } as never);
    await pipeline.initialize();
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg.url).toBe('http://explicit:6333');
  });

  it('skips the LanceDB default when only vectorStoreProvider is provided', async () => {
    const pipeline = new RAGPipeline({ vectorStoreProvider: 'qdrant' as never });
    // No vectorStore configured -> _initialize should throw.
    await expect(pipeline.initialize()).rejects.toThrow('No vector store configured');
  });

  it("resolves the 'local' preset to an embedded LanceDB config", async () => {
    const pipeline = new RAGPipeline({ vectorStorePreset: 'local' });
    await pipeline.initialize();
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).toMatchObject({
      provider: 'lancedb',
      uri: '.lancedb-data',
      tableName: 'documents',
      vectorDimension: 1536,
    });
  });

  it("resolves the 'qdrant-dev' preset to a localhost Qdrant config", async () => {
    const pipeline = new RAGPipeline({
      vectorStorePreset: 'qdrant-dev',
      collectionName: 'kb',
    });
    await pipeline.initialize();
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).toMatchObject({
      provider: 'qdrant',
      url: 'http://localhost:6333',
      collectionName: 'kb',
      vectorSize: 1536,
    });
  });

  it("resolves the 'postgres' preset to a localhost pgvector config", async () => {
    state.getDimension.mockReturnValue(3072);
    const pipeline = new RAGPipeline({
      vectorStorePreset: 'postgres',
      embeddingModel: 'text-embedding-3-large',
    });
    await pipeline.initialize();
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).toMatchObject({
      provider: 'pgvector',
      connectionString: 'postgres://postgres:postgres@localhost:5432/postgres',
      tableName: 'documents',
      vectorDimension: 3072,
    });
  });

  it("resolves the 'sandbox' preset to an in-memory sandbox config", async () => {
    const pipeline = new RAGPipeline({
      vectorStorePreset: 'sandbox',
      collectionName: 'tmp',
    });
    await pipeline.initialize();
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).toEqual({ provider: 'sandbox', collectionName: 'tmp' });
  });

  it('explicit vectorStore wins over vectorStorePreset', async () => {
    const pipeline = new RAGPipeline({
      vectorStorePreset: 'qdrant-dev',
      vectorStore: {
        provider: 'qdrant',
        url: 'http://explicit:6333',
        collectionName: 'explicit',
        vectorSize: 768,
      } as never,
    });
    await pipeline.initialize();
    const cfg = state.createVectorStore.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).toMatchObject({
      url: 'http://explicit:6333',
      collectionName: 'explicit',
      vectorSize: 768,
    });
  });

  it('merges DEFAULTS so explicit overrides win', async () => {
    const pipeline = new RAGPipeline({ topK: 25, vectorWeight: 0.9, bm25Weight: 0.1 });
    await pipeline.initialize();
    const cfg = state.lastRetrieverConfig as Record<string, Record<string, unknown>>;
    expect(cfg.topK).toBe(25);
    expect(cfg.fusion.vectorWeight).toBe(0.9);
    expect(cfg.fusion.bm25Weight).toBe(0.1);
    expect(cfg.bm25.k1).toBe(1.2);
  });
});

// ---------------------------------------------------------------------------
// initialize wiring
// ---------------------------------------------------------------------------

describe('RAGPipeline initialize wiring', () => {
  it('initializes the vector store and retriever exactly once', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    await pipeline.initialize();

    expect(state.createVectorStore).toHaveBeenCalledTimes(1);
    expect(state.vectorStore.initialize).toHaveBeenCalledTimes(1);
    expect(state.retriever.initialize).toHaveBeenCalledTimes(1);
  });

  it('shares the in-flight init promise for concurrent callers', async () => {
    let resolveInit!: (store: typeof state.vectorStore) => void;
    state.createVectorStore.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInit = resolve;
        }),
    );
    const pipeline = new RAGPipeline({});
    const a = pipeline.initialize();
    const b = pipeline.initialize();
    resolveInit(state.vectorStore);
    await Promise.all([a, b]);
    expect(state.createVectorStore).toHaveBeenCalledTimes(1);
  });

  it('does not construct a reranker when rerankerProvider is null', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    expect(state.rerankerCtor).not.toHaveBeenCalled();
  });

  it('constructs a reranker when rerankerProvider is set', async () => {
    const pipeline = new RAGPipeline({
      rerankerProvider: 'cohere',
      rerankerModel: 'rerank-english-v3.0',
      rerankerApiKey: 'rk',
    });
    await pipeline.initialize();
    expect(state.rerankerCtor).toHaveBeenCalledTimes(1);
    expect(state.lastRerankerConfig).toMatchObject({
      provider: 'cohere',
      model: 'rerank-english-v3.0',
      apiKey: 'rk',
    });
  });

  it('configures the context planner with provided context window options', async () => {
    const pipeline = new RAGPipeline({
      contextWindowBudget: 8000,
      contextWindowModel: 'gpt-4o',
      contextWindowStrategy: 'sliding-window',
    });
    await pipeline.initialize();
    expect(state.createTokenizer).toHaveBeenCalledWith('gpt-4o');
    expect(state.createStrategy).toHaveBeenCalledWith('sliding-window');
    expect(state.lastPlannerOptions).toMatchObject({ budget: 8000 });
  });

  it('falls back to context planner defaults', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    expect(state.createTokenizer).toHaveBeenCalledWith('gpt-4');
    expect(state.createStrategy).toHaveBeenCalledWith('priority-greedy');
    expect(state.lastPlannerOptions).toMatchObject({ budget: 128_000 });
  });
});

// ---------------------------------------------------------------------------
// ingest
// ---------------------------------------------------------------------------

describe('RAGPipeline.ingest', () => {
  it('chunks each document and indexes the combined chunks', async () => {
    const pipeline = new RAGPipeline({ chunkSize: 256, chunkOverlap: 25 });
    const chunks = await pipeline.ingest([
      { id: 'doc1', content: 'hello world', metadata: { a: 1 } },
      { id: 'doc2', content: 'second doc' },
    ]);

    expect(state.chunkDocument).toHaveBeenCalledTimes(2);
    expect(state.chunkDocument).toHaveBeenCalledWith(
      'hello world',
      'doc1',
      { strategy: 'fixed-size', chunkSize: 256, overlap: 25 },
      { a: 1 },
    );
    expect(chunks).toHaveLength(2);
    expect(state.retriever.indexChunks).toHaveBeenCalledTimes(1);
    expect(state.retriever.indexChunks.mock.calls[0][0]).toHaveLength(2);
  });

  it('returns chunks even if the retriever is somehow absent', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    // Force the private retriever to null to hit the guarded branch.
    (pipeline as unknown as { retriever: unknown }).retriever = null;
    const chunks = await pipeline.ingest([{ id: 'd', content: 'x' }]);
    expect(chunks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

describe('RAGPipeline.query', () => {
  const results = [
    { chunkId: 'c1', documentId: 'd1', content: 'a', score: 0.9 },
    { chunkId: 'c2', documentId: 'd1', content: 'b', score: 0.8 },
    { chunkId: 'c3', documentId: 'd2', content: 'c', score: 0.7 },
  ];

  it('retrieves with hybrid defaults and slices to topK', async () => {
    state.retriever.retrieve.mockResolvedValue(results);
    const pipeline = new RAGPipeline({ topK: 2 });
    const out = await pipeline.query('what is rag?');

    expect(out).toHaveLength(2);
    const opts = state.retriever.retrieve.mock.calls[0][1] as Record<string, unknown>;
    expect(opts).toMatchObject({
      topK: 2,
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      retrievalMode: 'hybrid',
    });
  });

  it('throws if the retriever was not initialized', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    (pipeline as unknown as { retriever: unknown }).retriever = null;
    await expect(pipeline.query('q')).rejects.toThrow('Pipeline not initialized');
  });

  it('honors explicit query options including filter and retrievalMode', async () => {
    state.retriever.retrieve.mockResolvedValue(results);
    const pipeline = new RAGPipeline({});
    await pipeline.query('q', {
      topK: 1,
      vectorWeight: 0.5,
      bm25Weight: 0.5,
      filter: { must: [] } as never,
      retrievalMode: 'vector',
    });
    const opts = state.retriever.retrieve.mock.calls[0][1] as Record<string, unknown>;
    expect(opts).toMatchObject({
      vectorWeight: 0.5,
      bm25Weight: 0.5,
      retrievalMode: 'vector',
    });
    expect(opts.filter).toEqual({ must: [] });
  });

  it('applies the reranker when one is configured and results exist', async () => {
    state.retriever.retrieve.mockResolvedValue(results);
    state.rerankResults.mockResolvedValue([results[2], results[0], results[1]]);
    const pipeline = new RAGPipeline({
      rerankerProvider: 'cohere',
      rerankFinalK: 2,
      topK: 5,
    });
    const out = await pipeline.query('q');
    expect(state.rerankResults).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(results[2]);
    // reranker requested rerankTopK from the retriever
    const opts = state.retriever.retrieve.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.topK).toBe(20);
  });

  it('skips reranking when results are empty', async () => {
    state.retriever.retrieve.mockResolvedValue([]);
    const pipeline = new RAGPipeline({ rerankerProvider: 'cohere' });
    const out = await pipeline.query('q');
    expect(state.rerankResults).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it('allows disabling the reranker per-query via useReranker:false', async () => {
    state.retriever.retrieve.mockResolvedValue(results);
    const pipeline = new RAGPipeline({ rerankerProvider: 'cohere', topK: 3 });
    const out = await pipeline.query('q', { useReranker: false });
    expect(state.rerankResults).not.toHaveBeenCalled();
    expect(out).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// buildContextWindow
// ---------------------------------------------------------------------------

describe('RAGPipeline.buildContextWindow', () => {
  it('packs each retrieval result into the context planner', async () => {
    const pipeline = new RAGPipeline({ contextWindowModel: 'gpt-4o' });
    const out = await pipeline.buildContextWindow(
      [
        { chunkId: 'c1', documentId: 'd1', content: 'one', score: 0.9 } as never,
        { chunkId: 'c2', documentId: 'd2', content: undefined, score: 0.5 } as never,
      ],
      'system prompt',
    );

    expect(state.contextPlanner.clear).toHaveBeenCalledTimes(1);
    expect(state.contextPlanner.add).toHaveBeenCalledTimes(2);
    expect(state.createRAGChunk).toHaveBeenCalledTimes(2);
    // second result has undefined content -> coerced to empty string
    const secondCall = state.createRAGChunk.mock.calls[1][0] as Record<string, unknown>;
    expect(secondCall.content).toBe('');
    expect(out).toMatchObject({ totalTokens: 0 });
  });

  it('throws when the context planner is unavailable', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    (pipeline as unknown as { contextPlanner: unknown }).contextPlanner = null;
    await expect(pipeline.buildContextWindow([])).rejects.toThrow(
      'Context planner not initialized',
    );
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

describe('RAGPipeline.getStats', () => {
  it('aggregates retriever stats and vector store collection info', async () => {
    const pipeline = new RAGPipeline({});
    const stats = await pipeline.getStats();
    expect(stats).toMatchObject({
      totalChunks: 3,
      totalDocuments: 2,
      collectionName: 'documents',
    });
    expect(stats.vectorStores).toHaveLength(1);
  });

  it('filters out collections whose info cannot be retrieved', async () => {
    state.vectorStore.listCollections.mockResolvedValue(['a', 'b']);
    state.vectorStore.getCollectionInfo
      .mockResolvedValueOnce({ name: 'a' })
      .mockRejectedValueOnce(new Error('boom'));
    const pipeline = new RAGPipeline({});
    const stats = await pipeline.getStats();
    expect(stats.vectorStores).toHaveLength(1);
  });

  it('falls back to single-collection info when listCollections throws', async () => {
    state.vectorStore.listCollections.mockRejectedValue(new Error('not supported'));
    state.vectorStore.getCollectionInfo.mockResolvedValue({ name: 'documents' });
    const pipeline = new RAGPipeline({});
    const stats = await pipeline.getStats();
    expect(stats.vectorStores).toHaveLength(1);
  });

  it('swallows errors when both listCollections and fallback fail', async () => {
    state.vectorStore.listCollections.mockRejectedValue(new Error('no list'));
    state.vectorStore.getCollectionInfo.mockRejectedValue(new Error('no info'));
    const pipeline = new RAGPipeline({});
    const stats = await pipeline.getStats();
    expect(stats.vectorStores).toEqual([]);
  });

  it('handles a falsy collection info in the fallback path', async () => {
    state.vectorStore.listCollections.mockRejectedValue(new Error('no list'));
    state.vectorStore.getCollectionInfo.mockResolvedValue(null);
    const pipeline = new RAGPipeline({});
    const stats = await pipeline.getStats();
    expect(stats.vectorStores).toEqual([]);
  });

  it('returns empty stats when no retriever is present', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    (pipeline as unknown as { retriever: unknown }).retriever = null;
    const stats = await pipeline.getStats();
    expect(stats).toEqual({
      totalChunks: 0,
      totalDocuments: 0,
      collectionName: 'unknown',
      vectorStores: [],
    });
  });

  it('skips vector store stats collection when vectorStore is null', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    (pipeline as unknown as { vectorStore: unknown }).vectorStore = null;
    const stats = await pipeline.getStats();
    expect(stats.vectorStores).toEqual([]);
    expect(stats.totalChunks).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// collection name resolution
// ---------------------------------------------------------------------------

describe('collection name resolution', () => {
  it('uses collectionName when present', async () => {
    const pipeline = new RAGPipeline({
      vectorStore: { provider: 'qdrant', collectionName: 'coll', vectorSize: 1 } as never,
    });
    const stats = await pipeline.getStats();
    expect(stats.collectionName).toBe('coll');
  });

  it('uses indexName when present', async () => {
    const pipeline = new RAGPipeline({
      vectorStore: { provider: 'pinecone', indexName: 'idx' } as never,
    });
    const stats = await pipeline.getStats();
    expect(stats.collectionName).toBe('idx');
  });

  it('uses tableName when present', async () => {
    const pipeline = new RAGPipeline({
      vectorStore: { provider: 'lancedb', tableName: 'tbl' } as never,
    });
    const stats = await pipeline.getStats();
    expect(stats.collectionName).toBe('tbl');
  });

  it('uses className when present', async () => {
    const pipeline = new RAGPipeline({
      vectorStore: { provider: 'weaviate', className: 'Doc' } as never,
    });
    const stats = await pipeline.getStats();
    expect(stats.collectionName).toBe('Doc');
  });

  it('defaults to "documents" when no name field is present', async () => {
    const pipeline = new RAGPipeline({
      vectorStore: { provider: 'custom' } as never,
    });
    const stats = await pipeline.getStats();
    expect(stats.collectionName).toBe('documents');
  });
});

// ---------------------------------------------------------------------------
// capabilities / health / cost model
// ---------------------------------------------------------------------------

describe('vector store introspection', () => {
  it('returns vector store capabilities', async () => {
    const pipeline = new RAGPipeline({});
    const caps = await pipeline.getVectorStoreCapabilities();
    expect(caps).toMatchObject({ name: 'lancedb-caps' });
  });

  it('returns null capabilities when vector store is absent', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    (pipeline as unknown as { vectorStore: unknown }).vectorStore = null;
    const caps = await pipeline.getVectorStoreCapabilities();
    expect(caps).toBeNull();
  });

  it('returns the health check result', async () => {
    const pipeline = new RAGPipeline({});
    expect(await pipeline.getVectorStoreHealth()).toBe(true);
  });

  it('returns false health when vector store is absent', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    (pipeline as unknown as { vectorStore: unknown }).vectorStore = null;
    expect(await pipeline.getVectorStoreHealth()).toBe(false);
  });

  it('returns the cost model when initialized', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    expect(pipeline.getVectorStoreCostModel()).toMatchObject({ perQuery: 0.001 });
  });

  it('returns null cost model before initialization', () => {
    const pipeline = new RAGPipeline({});
    expect(pipeline.getVectorStoreCostModel()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readiness report
// ---------------------------------------------------------------------------

describe('RAGPipeline.getVectorStoreReadiness', () => {
  it('reports healthy with stats and no issues', async () => {
    const pipeline = new RAGPipeline({});
    const report = await pipeline.getVectorStoreReadiness();
    expect(report.healthy).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.provider).toBe('lancedb');
    expect(report.stats).toMatchObject({ name: 'documents' });
    expect(typeof report.latencyMs).toBe('number');
  });

  it('records an issue when the health check returns false', async () => {
    state.vectorStore.healthCheck.mockResolvedValue(false);
    const pipeline = new RAGPipeline({});
    const report = await pipeline.getVectorStoreReadiness();
    expect(report.healthy).toBe(false);
    expect(report.issues[0]).toMatchObject({ code: 'HEALTH_CHECK_FAILED', severity: 'error' });
  });

  it('treats a thrown health check as unhealthy', async () => {
    state.vectorStore.healthCheck.mockRejectedValue(new Error('down'));
    const pipeline = new RAGPipeline({});
    const report = await pipeline.getVectorStoreReadiness();
    expect(report.healthy).toBe(false);
    expect(report.issues).toHaveLength(1);
  });

  it('leaves stats null when collection info lookup throws', async () => {
    state.vectorStore.getCollectionInfo.mockRejectedValue(new Error('no collection'));
    const pipeline = new RAGPipeline({});
    const report = await pipeline.getVectorStoreReadiness();
    expect(report.stats).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getVectorStoreStats
// ---------------------------------------------------------------------------

describe('RAGPipeline.getVectorStoreStats', () => {
  it('returns the first vector store stats entry', async () => {
    const pipeline = new RAGPipeline({});
    const stats = await pipeline.getVectorStoreStats();
    expect(stats).toMatchObject({ name: 'documents' });
  });

  it('returns null when there are no vector store stats', async () => {
    state.vectorStore.listCollections.mockResolvedValue([]);
    const pipeline = new RAGPipeline({});
    const stats = await pipeline.getVectorStoreStats();
    expect(stats).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// close
// ---------------------------------------------------------------------------

describe('RAGPipeline.close', () => {
  it('closes the retriever and resets internal state', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    await pipeline.close();
    expect(state.retriever.close).toHaveBeenCalledTimes(1);
    // vector store close NOT called when retriever exists (retriever owns it)
    expect(state.vectorStore.close).not.toHaveBeenCalled();
    // Re-initialization works after close.
    await pipeline.initialize();
    expect(state.createVectorStore).toHaveBeenCalledTimes(2);
  });

  it('closes the vector store directly when no retriever is present', async () => {
    const pipeline = new RAGPipeline({});
    await pipeline.initialize();
    (pipeline as unknown as { retriever: unknown }).retriever = null;
    await pipeline.close();
    expect(state.vectorStore.close).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing was initialized', async () => {
    const pipeline = new RAGPipeline({});
    await expect(pipeline.close()).resolves.toBeUndefined();
    expect(state.retriever.close).not.toHaveBeenCalled();
  });
});

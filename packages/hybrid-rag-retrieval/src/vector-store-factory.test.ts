import type { VectorStoreConfig } from '@reaatech/hybrid-rag';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Generic mock adapter constructor factory keyed by provider name.
function mockWrapper(provider: string) {
  return class {
    provider = provider;
    capabilities = {} as never;
    costModel = {} as never;
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
    initialize = vi.fn();
    search = vi.fn();
    upsertPoint = vi.fn();
    upsertBatch = vi.fn();
    deleteCollection = vi.fn();
    getCollectionInfo = vi.fn();
    listCollections = vi.fn();
    healthCheck = vi.fn().mockResolvedValue(true);
    close = vi.fn();
  };
}

function moduleNotFound() {
  const err = new Error('Cannot find module') as NodeJS.ErrnoException;
  err.code = 'ERR_MODULE_NOT_FOUND';
  throw err;
}

vi.mock('@reaatech/hybrid-rag-qdrant', () => ({ QdrantClientWrapper: mockWrapper('qdrant') }));
vi.mock('@reaatech/hybrid-rag-pinecone', () => ({
  PineconeClientWrapper: mockWrapper('pinecone'),
}));
vi.mock('@reaatech/hybrid-rag-weaviate', () => ({
  WeaviateClientWrapper: mockWrapper('weaviate'),
}));
vi.mock('@reaatech/hybrid-rag-chroma', () => ({ ChromaClientWrapper: mockWrapper('chroma') }));
vi.mock('@reaatech/hybrid-rag-pgvector', () => ({
  PgVectorClientWrapper: mockWrapper('pgvector'),
}));
vi.mock('@reaatech/hybrid-rag-milvus', () => ({ MilvusClientWrapper: mockWrapper('milvus') }));
vi.mock('@reaatech/hybrid-rag-elasticsearch', () => ({
  ElasticsearchClientWrapper: mockWrapper('elasticsearch'),
}));
vi.mock('@reaatech/hybrid-rag-opensearch', () => ({
  OpenSearchClientWrapper: mockWrapper('opensearch'),
}));
vi.mock('@reaatech/hybrid-rag-redis', () => ({
  RedisVectorClientWrapper: mockWrapper('redis'),
}));
vi.mock('@reaatech/hybrid-rag-mongodb', () => ({
  MongoDBVectorClientWrapper: mockWrapper('mongodb'),
}));
vi.mock('@reaatech/hybrid-rag-azure-ai-search', () => ({
  AzureAISearchClientWrapper: mockWrapper('azure-ai-search'),
}));
vi.mock('@reaatech/hybrid-rag-lancedb', () => ({ LanceDBClientWrapper: mockWrapper('lancedb') }));
// vespa & supabase: simulate missing adapter to hit the friendly-error branch.
vi.mock('@reaatech/hybrid-rag-vespa', () => ({
  get VespaClientWrapper() {
    return moduleNotFound();
  },
}));
vi.mock('@reaatech/hybrid-rag-supabase', () => ({
  get SupabaseVectorClientWrapper() {
    throw new Error('boom: some other failure');
  },
}));

class MockSandboxStore {
  provider = 'sandbox';
  capabilities = {} as never;
  costModel = {} as never;
  initialize = vi.fn();
  search = vi.fn();
  upsertPoint = vi.fn();
  upsertBatch = vi.fn();
  deleteCollection = vi.fn();
  getCollectionInfo = vi.fn();
  listCollections = vi.fn();
  healthCheck = vi.fn().mockResolvedValue(true);
  close = vi.fn();
}
vi.mock('./sandbox-store.js', () => ({ SandboxVectorStore: MockSandboxStore }));

const hasProviderMock = vi.fn();
const createFromRegistryMock = vi.fn();
vi.mock('./vector-store-registry.js', () => ({
  hasProvider: (p: string) => hasProviderMock(p),
  createFromRegistry: (c: VectorStoreConfig) => createFromRegistryMock(c),
}));

import { createVectorStore } from './vector-store-factory.js';

describe('createVectorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasProviderMock.mockReturnValue(false);
  });

  it('delegates to the registry when provider is registered', async () => {
    hasProviderMock.mockReturnValue(true);
    const fake = { provider: 'custom' } as never;
    createFromRegistryMock.mockReturnValue(fake);
    const config = { provider: 'custom' } as unknown as VectorStoreConfig;
    const adapter = await createVectorStore(config);
    expect(adapter).toBe(fake);
    expect(createFromRegistryMock).toHaveBeenCalledWith(config);
  });

  const successCases: Array<[string, VectorStoreConfig]> = [
    [
      'qdrant',
      { provider: 'qdrant', url: 'http://localhost:6333', collectionName: 'c', vectorSize: 1536 },
    ],
    ['pinecone', { provider: 'pinecone', apiKey: 'k', indexName: 'i' }],
    ['weaviate', { provider: 'weaviate', url: 'u', className: 'C' } as never],
    ['chroma', { provider: 'chroma', url: 'u', collectionName: 'c' } as never],
    [
      'pgvector',
      { provider: 'pgvector', connectionString: 'p', tableName: 't', vectorDimension: 3 } as never,
    ],
    [
      'milvus',
      { provider: 'milvus', address: 'a', collectionName: 'c', vectorDimension: 3 } as never,
    ],
    [
      'elasticsearch',
      { provider: 'elasticsearch', node: 'n', indexName: 'i', vectorDimension: 3 } as never,
    ],
    [
      'opensearch',
      { provider: 'opensearch', node: 'n', indexName: 'i', vectorDimension: 3 } as never,
    ],
    ['redis', { provider: 'redis', url: 'u', indexName: 'i', vectorDimension: 3 } as never],
    [
      'mongodb',
      {
        provider: 'mongodb',
        connectionString: 'c',
        databaseName: 'd',
        collectionName: 'c',
        vectorIndexName: 'v',
        vectorDimension: 3,
      } as never,
    ],
    [
      'azure-ai-search',
      {
        provider: 'azure-ai-search',
        endpoint: 'e',
        apiKey: 'k',
        indexName: 'i',
        vectorDimension: 3,
      } as never,
    ],
    ['lancedb', { provider: 'lancedb', uri: 'u', tableName: 't', vectorDimension: 3 } as never],
    ['sandbox', { provider: 'sandbox' } as never],
  ];

  it.each(successCases)('creates the %s adapter', async (provider, config) => {
    const adapter = await createVectorStore(config);
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe(provider);
  });

  it('throws a friendly error when vespa adapter is not installed', async () => {
    const config = {
      provider: 'vespa',
      endpoint: 'e',
      namespace: 'n',
      documentType: 'd',
      vectorDimension: 3,
    } as unknown as VectorStoreConfig;
    await expect(createVectorStore(config)).rejects.toThrow(
      "Provider 'vespa' selected but '@reaatech/hybrid-rag-vespa' is not installed",
    );
  });

  it('re-throws non-module-not-found errors from an adapter import', async () => {
    const config = {
      provider: 'supabase',
      url: 'u',
      serviceRoleKey: 'k',
      tableName: 't',
      vectorDimension: 3,
    } as unknown as VectorStoreConfig;
    await expect(createVectorStore(config)).rejects.toThrow('boom: some other failure');
  });

  it('throws for unknown provider', async () => {
    const config = { provider: 'nope' } as unknown as VectorStoreConfig;
    await expect(createVectorStore(config)).rejects.toThrow('Unknown vector store provider: nope');
  });
});

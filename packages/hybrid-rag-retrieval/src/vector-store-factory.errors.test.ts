import type { VectorStoreConfig } from '@reaatech/hybrid-rag';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Module-level switch controlling whether the simulated import failure looks
// like a missing optional dependency (ERR_MODULE_NOT_FOUND) or some other
// error. This lets the same set of mocks exercise both catch branches.
const failureMode = vi.hoisted(() => ({ code: 'ERR_MODULE_NOT_FOUND' as string | undefined }));

// Every adapter package's named export getter throws on access, simulating an
// import failure. This exercises the catch branches in every provider case.
function notFoundExport(exportName: string) {
  return {
    get [exportName]() {
      const err = new Error('simulated import failure') as NodeJS.ErrnoException;
      err.code = failureMode.code;
      throw err;
    },
  };
}

vi.mock('@reaatech/hybrid-rag-qdrant', () => notFoundExport('QdrantClientWrapper'));
vi.mock('@reaatech/hybrid-rag-pinecone', () => notFoundExport('PineconeClientWrapper'));
vi.mock('@reaatech/hybrid-rag-weaviate', () => notFoundExport('WeaviateClientWrapper'));
vi.mock('@reaatech/hybrid-rag-chroma', () => notFoundExport('ChromaClientWrapper'));
vi.mock('@reaatech/hybrid-rag-pgvector', () => notFoundExport('PgVectorClientWrapper'));
vi.mock('@reaatech/hybrid-rag-milvus', () => notFoundExport('MilvusClientWrapper'));
vi.mock('@reaatech/hybrid-rag-elasticsearch', () => notFoundExport('ElasticsearchClientWrapper'));
vi.mock('@reaatech/hybrid-rag-opensearch', () => notFoundExport('OpenSearchClientWrapper'));
vi.mock('@reaatech/hybrid-rag-redis', () => notFoundExport('RedisVectorClientWrapper'));
vi.mock('@reaatech/hybrid-rag-mongodb', () => notFoundExport('MongoDBVectorClientWrapper'));
vi.mock('@reaatech/hybrid-rag-azure-ai-search', () => notFoundExport('AzureAISearchClientWrapper'));
vi.mock('@reaatech/hybrid-rag-lancedb', () => notFoundExport('LanceDBClientWrapper'));
vi.mock('@reaatech/hybrid-rag-vespa', () => notFoundExport('VespaClientWrapper'));
vi.mock('@reaatech/hybrid-rag-supabase', () => notFoundExport('SupabaseVectorClientWrapper'));

vi.mock('./vector-store-registry.js', () => ({
  hasProvider: () => false,
  createFromRegistry: vi.fn(),
}));

import { createVectorStore } from './vector-store-factory.js';

const providers = [
  'qdrant',
  'pinecone',
  'weaviate',
  'chroma',
  'pgvector',
  'milvus',
  'elasticsearch',
  'opensearch',
  'redis',
  'mongodb',
  'azure-ai-search',
  'lancedb',
  'vespa',
  'supabase',
] as const;

describe('createVectorStore friendly errors for missing adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failureMode.code = 'ERR_MODULE_NOT_FOUND';
  });

  it.each(providers)('throws a friendly error when %s adapter is missing', async (provider) => {
    const config = { provider } as unknown as VectorStoreConfig;
    await expect(createVectorStore(config)).rejects.toThrow(
      `Provider '${provider}' selected but '@reaatech/hybrid-rag-${provider}' is not installed`,
    );
  });
});

describe('createVectorStore re-throws non-module-not-found import errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failureMode.code = 'SOME_OTHER_CODE';
  });

  it.each(providers)('re-throws raw error for %s', async (provider) => {
    const config = { provider } as unknown as VectorStoreConfig;
    await expect(createVectorStore(config)).rejects.toThrow('simulated import failure');
  });
});

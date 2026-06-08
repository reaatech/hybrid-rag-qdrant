import { describe, expect, it } from 'vitest';
import { validateVectorStoreConfig, vectorStoreConfigSchema } from './schemas.js';

const validConfigs = [
  {
    provider: 'qdrant',
    url: 'http://localhost:6333',
    collectionName: 'documents',
    vectorSize: 1536,
  },
  { provider: 'pinecone', apiKey: 'pc-key', indexName: 'documents' },
  { provider: 'weaviate', url: 'http://localhost:8080', className: 'Document' },
  { provider: 'chroma', url: 'http://localhost:8000', collectionName: 'documents' },
  {
    provider: 'pgvector',
    connectionString: 'postgresql://user:pass@localhost:5432/rag',
    tableName: 'documents',
    vectorDimension: 1536,
  },
  {
    provider: 'milvus',
    address: 'localhost:19530',
    collectionName: 'documents',
    vectorDimension: 1536,
  },
  {
    provider: 'elasticsearch',
    node: 'http://localhost:9200',
    indexName: 'documents',
    vectorDimension: 1536,
  },
  {
    provider: 'opensearch',
    node: 'http://localhost:9200',
    indexName: 'documents',
    vectorDimension: 1536,
  },
  {
    provider: 'redis',
    url: 'redis://localhost:6379',
    indexName: 'documents',
    vectorDimension: 1536,
  },
  {
    provider: 'mongodb',
    connectionString: 'mongodb://localhost:27017',
    databaseName: 'rag',
    collectionName: 'documents',
    vectorIndexName: 'vector_index',
    vectorDimension: 1536,
  },
  {
    provider: 'azure-ai-search',
    endpoint: 'https://example.search.windows.net',
    apiKey: 'azure-key',
    indexName: 'documents',
    vectorDimension: 1536,
  },
  {
    provider: 'lancedb',
    uri: '.lancedb-data',
    tableName: 'documents',
    vectorDimension: 1536,
  },
  {
    provider: 'vespa',
    endpoint: 'http://localhost:8080',
    namespace: 'rag',
    documentType: 'document',
    vectorDimension: 1536,
  },
  {
    provider: 'supabase',
    url: 'https://project.supabase.co',
    serviceRoleKey: 'service-role-key',
    tableName: 'documents',
    vectorDimension: 1536,
  },
  { provider: 'sandbox', collectionName: 'documents' },
] as const;

describe('vectorStoreConfigSchema', () => {
  it.each(validConfigs)('validates $provider config', (config) => {
    expect(vectorStoreConfigSchema.safeParse(config).success).toBe(true);
    expect(validateVectorStoreConfig(config).provider).toBe(config.provider);
  });

  it('rejects unknown providers', () => {
    expect(vectorStoreConfigSchema.safeParse({ provider: 'azure' }).success).toBe(false);
  });

  it('rejects missing provider-specific required fields', () => {
    expect(
      vectorStoreConfigSchema.safeParse({ provider: 'qdrant', url: 'http://localhost:6333' })
        .success,
    ).toBe(false);
    expect(
      vectorStoreConfigSchema.safeParse({ provider: 'pinecone', apiKey: 'pc-key' }).success,
    ).toBe(false);
    expect(
      vectorStoreConfigSchema.safeParse({ provider: 'lancedb', uri: '.lancedb-data' }).success,
    ).toBe(false);
  });

  it('rejects invalid vector dimensions', () => {
    expect(
      vectorStoreConfigSchema.safeParse({
        provider: 'pgvector',
        connectionString: 'postgresql://localhost/rag',
        tableName: 'documents',
        vectorDimension: 0,
      }).success,
    ).toBe(false);
  });
});

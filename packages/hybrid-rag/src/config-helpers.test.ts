import { describe, expect, it } from 'vitest';
import {
  createChromaVectorStoreConfig,
  createLocalVectorStoreConfig,
  createPgVectorStoreConfig,
  createQdrantVectorStoreConfig,
} from './config-helpers.js';
import { vectorStoreConfigSchema } from './schemas.js';

describe('createLocalVectorStoreConfig', () => {
  it('returns embedded LanceDB config with defaults', () => {
    const config = createLocalVectorStoreConfig();
    expect(config).toEqual({
      provider: 'lancedb',
      uri: '.lancedb-data',
      tableName: 'documents',
      vectorDimension: 1536,
    });
    expect(vectorStoreConfigSchema.safeParse(config).success).toBe(true);
  });

  it('honours provided overrides', () => {
    const config = createLocalVectorStoreConfig({
      uri: '/tmp/db',
      tableName: 'chunks',
      vectorDimension: 768,
    });
    expect(config).toEqual({
      provider: 'lancedb',
      uri: '/tmp/db',
      tableName: 'chunks',
      vectorDimension: 768,
    });
  });
});

describe('createQdrantVectorStoreConfig', () => {
  it('builds a valid config with defaults', () => {
    const config = createQdrantVectorStoreConfig({
      url: 'http://localhost:6333',
      vectorSize: 1536,
    });
    expect(config).toEqual({
      provider: 'qdrant',
      url: 'http://localhost:6333',
      apiKey: undefined,
      collectionName: 'documents',
      vectorSize: 1536,
    });
    expect(vectorStoreConfigSchema.safeParse(config).success).toBe(true);
  });

  it('passes through apiKey and collectionName', () => {
    const config = createQdrantVectorStoreConfig({
      url: 'http://qdrant:6333',
      apiKey: 'secret',
      collectionName: 'kb',
      vectorSize: 3072,
    });
    if (config.provider !== 'qdrant') throw new Error('expected qdrant');
    expect(config.apiKey).toBe('secret');
    expect(config.collectionName).toBe('kb');
    expect(config.vectorSize).toBe(3072);
  });
});

describe('createPgVectorStoreConfig', () => {
  it('builds a valid config with defaults', () => {
    const config = createPgVectorStoreConfig({
      connectionString: 'postgres://localhost/db',
      vectorDimension: 1536,
    });
    expect(config).toEqual({
      provider: 'pgvector',
      connectionString: 'postgres://localhost/db',
      tableName: 'documents',
      vectorDimension: 1536,
      schema: undefined,
    });
    expect(vectorStoreConfigSchema.safeParse(config).success).toBe(true);
  });

  it('passes through tableName and schema', () => {
    const config = createPgVectorStoreConfig({
      connectionString: 'postgres://localhost/db',
      tableName: 'embeddings',
      vectorDimension: 768,
      schema: 'rag',
    });
    if (config.provider !== 'pgvector') throw new Error('expected pgvector');
    expect(config.tableName).toBe('embeddings');
    expect(config.schema).toBe('rag');
  });
});

describe('createChromaVectorStoreConfig', () => {
  it('builds a valid config with defaults', () => {
    const config = createChromaVectorStoreConfig();
    expect(config).toEqual({
      provider: 'chroma',
      url: 'http://localhost:8000',
      collectionName: 'documents',
    });
    expect(vectorStoreConfigSchema.safeParse(config).success).toBe(true);
  });

  it('honours provided url and collectionName', () => {
    const config = createChromaVectorStoreConfig({
      url: 'http://chroma:8000',
      collectionName: 'kb',
    });
    if (config.provider !== 'chroma') throw new Error('expected chroma');
    expect(config.url).toBe('http://chroma:8000');
    expect(config.collectionName).toBe('kb');
  });
});

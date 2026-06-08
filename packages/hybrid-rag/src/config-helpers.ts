import { validateVectorStoreConfig } from './schemas.js';
import type { VectorStoreConfig } from './vector-store.js';

/**
 * Build an embedded LanceDB {@link VectorStoreConfig} — the zero-config default.
 * No server or Docker required.
 */
export function createLocalVectorStoreConfig(options?: {
  tableName?: string;
  uri?: string;
  vectorDimension?: number;
}): VectorStoreConfig {
  return validateVectorStoreConfig({
    provider: 'lancedb',
    uri: options?.uri ?? '.lancedb-data',
    tableName: options?.tableName ?? 'documents',
    vectorDimension: options?.vectorDimension ?? 1536,
  });
}

/**
 * Build a Qdrant {@link VectorStoreConfig}.
 */
export function createQdrantVectorStoreConfig(options: {
  url: string;
  apiKey?: string;
  collectionName?: string;
  vectorSize: number;
}): VectorStoreConfig {
  return validateVectorStoreConfig({
    provider: 'qdrant',
    url: options.url,
    apiKey: options.apiKey,
    collectionName: options.collectionName ?? 'documents',
    vectorSize: options.vectorSize,
  });
}

/**
 * Build a pgvector {@link VectorStoreConfig}.
 */
export function createPgVectorStoreConfig(options: {
  connectionString: string;
  tableName?: string;
  vectorDimension: number;
  schema?: string;
}): VectorStoreConfig {
  return validateVectorStoreConfig({
    provider: 'pgvector',
    connectionString: options.connectionString,
    tableName: options.tableName ?? 'documents',
    vectorDimension: options.vectorDimension,
    schema: options.schema,
  });
}

/**
 * Build a Chroma {@link VectorStoreConfig}. Chroma requires a running server;
 * `url` defaults to `http://localhost:8000`.
 */
export function createChromaVectorStoreConfig(options?: {
  url?: string;
  collectionName?: string;
}): VectorStoreConfig {
  return validateVectorStoreConfig({
    provider: 'chroma',
    url: options?.url ?? 'http://localhost:8000',
    collectionName: options?.collectionName ?? 'documents',
  });
}

import { describe, expect, it } from 'vitest';
import type {
  SparseVector,
  StandardFilter,
  VectorStorePoint,
  VectorStoreProvider,
} from './vector-store.js';
import { VectorStoreOperationError } from './vector-store.js';

describe('VectorStoreProvider', () => {
  it('should include all expected providers', () => {
    const providers: VectorStoreProvider[] = [
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
      'sandbox',
    ];
    expect(providers).toContain('qdrant');
    expect(providers).toContain('pinecone');
    expect(providers).toContain('weaviate');
    expect(providers).toContain('chroma');
    expect(providers).toContain('pgvector');
    expect(providers).toContain('milvus');
    expect(providers).toContain('elasticsearch');
    expect(providers).toContain('opensearch');
    expect(providers).toContain('redis');
    expect(providers).toContain('mongodb');
    expect(providers).toContain('azure-ai-search');
    expect(providers).toContain('lancedb');
    expect(providers).toContain('vespa');
    expect(providers).toContain('supabase');
    expect(providers).toContain('sandbox');
    expect(new Set(providers).size).toBe(providers.length);
  });
});

describe('VectorStorePoint', () => {
  it('should require id, vector, and payload', () => {
    const point: VectorStorePoint = {
      id: 'chunk-001',
      vector: [0.1, 0.2, 0.3],
      payload: { documentId: 'doc-1', content: 'hello' },
    };
    expect(point.id).toBe('chunk-001');
    expect(point.vector).toHaveLength(3);
    expect(point.payload.documentId).toBe('doc-1');
  });

  it('should accept optional sparseVector', () => {
    const point: VectorStorePoint = {
      id: 'chunk-002',
      vector: [0.4, 0.5, 0.6],
      payload: {},
      sparseVector: { indices: [1, 2, 3], values: [0.1, 0.2, 0.3] },
    };
    expect(point.sparseVector).toBeDefined();
    expect(point.sparseVector!.indices).toEqual([1, 2, 3]);
  });
});

describe('StandardFilter', () => {
  it('should accept simple field-value filter', () => {
    const filter: StandardFilter = { department: 'engineering' };
    expect(filter).toBeDefined();
  });

  it('should accept operator filters', () => {
    const filter: StandardFilter = {
      age: { $gte: 18 },
      name: { $eq: 'Alice' },
    };
    expect(filter).toBeDefined();
  });

  it('should accept logical combinators', () => {
    const filter: StandardFilter = {
      $and: [{ status: { $eq: 'active' } }, { $or: [{ role: 'admin' }, { role: 'moderator' }] }],
    };
    expect(filter).toBeDefined();
  });

  it('should accept array value filters', () => {
    const filter: StandardFilter = {
      tags: { $in: ['javascript', 'typescript'] },
      ids: { $nin: [1, 2, 3] },
    };
    expect(filter).toBeDefined();
  });

  it('should accept exists filter', () => {
    const filter: StandardFilter = {
      email: { $exists: true },
    };
    expect(filter).toBeDefined();
  });
});

describe('SparseVector', () => {
  it('should have aligned indices and values arrays', () => {
    const sv: SparseVector = {
      indices: [100, 200, 300],
      values: [0.5, 1.2, 0.8],
    };
    expect(sv.indices).toHaveLength(sv.values.length);
    expect(sv.indices[0]).toBe(100);
    expect(sv.values[0]).toBe(0.5);
  });
});

describe('VectorStoreOperationError', () => {
  it('should construct with message, provider, and operation', () => {
    const error = new VectorStoreOperationError('Test error message', 'qdrant', 'search');
    expect(error.message).toBe('Test error message');
    expect(error.provider).toBe('qdrant');
    expect(error.operation).toBe('search');
    expect(error.name).toBe('VectorStoreOperationError');
    expect(error).toBeInstanceOf(Error);
  });

  it('should construct with different providers', () => {
    const error = new VectorStoreOperationError('Pinecone error', 'pinecone', 'upsertBatch');
    expect(error.provider).toBe('pinecone');
    expect(error.operation).toBe('upsertBatch');
  });
});

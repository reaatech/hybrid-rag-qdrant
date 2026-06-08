import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseVectorClientWrapper } from './supabase-client.js';

let mockQueryResult: any;

function createMockQuery() {
  const q: any = {
    eq: vi.fn(() => q),
    neq: vi.fn(() => q),
    in: vi.fn(() => q),
    not: vi.fn(() => q),
    gt: vi.fn(() => q),
    gte: vi.fn(() => q),
    lt: vi.fn(() => q),
    lte: vi.fn(() => q),
    is: vi.fn(() => q),
    or: vi.fn(() => q),
    select: vi.fn(() => q),
    range: vi.fn(() => q),
    upsert: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
  };
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock of the Supabase query builder
  q.then = (onfulfilled: any) => Promise.resolve(mockQueryResult).then(onfulfilled);
  return q;
}

const mockFrom = vi.fn(() => createMockQuery());
const mockRpc = vi.fn(() => createMockQuery());
const mockSchemaSupabase = {
  from: vi.fn(() => createMockQuery()),
  rpc: vi.fn(() => createMockQuery()),
};
const mockSchema = vi.fn(() => mockSchemaSupabase);

const mockSupabaseClient = { from: mockFrom, rpc: mockRpc, schema: mockSchema };

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

const createClientMock = (await import('@supabase/supabase-js')).createClient;

const validConfig = {
  url: 'https://test.supabase.co',
  serviceRoleKey: 'test-key',
  tableName: 'test',
  vectorDimension: 1536,
};

const schemaConfig = { ...validConfig, schema: 'custom_schema' };

let adapter: SupabaseVectorClientWrapper;

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryResult = { data: null, error: null, count: 0 };
  adapter = new SupabaseVectorClientWrapper(validConfig);
});

describe('constructor', () => {
  it('should accept a valid config and set provider', () => {
    expect(adapter.provider).toBe('supabase');
  });

  it('should expose correct capabilities', () => {
    expect(adapter.capabilities.supportsHybridSearch).toBe(false);
    expect(adapter.capabilities.supportsMetadataFiltering).toBe(true);
    expect(adapter.capabilities.supportsBatchUpsert).toBe(true);
    expect(adapter.capabilities.supportsCollectionManagement).toBe(false);
    expect(adapter.capabilities.supportsMultiTenancy).toBe(true);
    expect(adapter.capabilities.supportsQuantization).toBe(false);
    expect(adapter.capabilities.supportsScan).toBe(true);
    expect(adapter.capabilities.maxBatchSize).toBe(500);
    expect(adapter.capabilities.maxVectorDimension).toBe(16000);
  });

  it('should expose cost model', () => {
    expect(adapter.costModel.costPerQueryEstimate).toBe(0);
    expect(adapter.costModel.costPer1000Upserts).toBe(0);
  });
});

describe('initialize', () => {
  it('should create client with url and key', async () => {
    await adapter.initialize();
    expect(createClientMock).toHaveBeenCalledWith(validConfig.url, validConfig.serviceRoleKey);
  });

  it('should be idempotent', async () => {
    await adapter.initialize();
    await adapter.initialize();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('should return same promise on concurrent calls', async () => {
    const p1 = adapter.initialize();
    const p2 = adapter.initialize();
    const p3 = adapter.initialize();
    await Promise.all([p1, p2, p3]);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('should return initPromise when already initializing', async () => {
    const slowAdapter = new SupabaseVectorClientWrapper(validConfig);
    let resolveInit: () => void;
    (slowAdapter as any)._initialize = () =>
      new Promise<void>((resolve) => {
        resolveInit = resolve;
        (slowAdapter as any).client = mockSupabaseClient;
      });
    const p1 = slowAdapter.initialize();
    const p2 = slowAdapter.initialize();
    const p3 = slowAdapter.initialize();
    resolveInit!();
    await Promise.all([p1, p2, p3]);
    expect(createClientMock).toHaveBeenCalledTimes(0);
  });
});

describe('search', () => {
  beforeEach(async () => {
    await adapter.initialize();
  });

  it('should call rpc with vector and topK', async () => {
    mockQueryResult = {
      data: [{ id: '1', content: 'doc1', similarity: 0.9 }],
      error: null,
    };
    const results = await adapter.search({ vector: [0.1, 0.2], topK: 5 });
    expect(mockRpc).toHaveBeenCalledWith('match_documents', {
      query_embedding: '[0.1,0.2]',
      match_threshold: 0.0,
      match_count: 5,
    });
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe('1');
    expect(results[0].content).toBe('doc1');
    expect(results[0].score).toBe(0.9);
    expect(results[0].source).toBe('vector');
  });

  it('should apply filter when provided', async () => {
    mockQueryResult = { data: [], error: null };
    await adapter.search({ vector: [0.1], topK: 3, filter: { status: { $eq: 'active' } } });
    const query = mockRpc.mock.results[0]?.value;
    expect(query.eq).toHaveBeenCalledWith('metadata->>status', 'active');
  });

  it('should throw on rpc error', async () => {
    mockQueryResult = { data: null, error: { message: 'connection refused' } };
    await expect(adapter.search({ vector: [0.1], topK: 3 })).rejects.toThrow(
      'Supabase search failed',
    );
  });

  it('should handle result with document_id field', async () => {
    mockQueryResult = {
      data: [{ id: '1', content: 'doc1', document_id: 'doc-1', score: 0.8 }],
      error: null,
    };
    const results = await adapter.search({ vector: [0.1], topK: 3 });
    expect(results[0].documentId).toBe('doc-1');
  });

  it('should handle result with documentId field', async () => {
    mockQueryResult = {
      data: [{ id: '1', content: 'doc1', documentId: 'doc-1', similarity: 0.8 }],
      error: null,
    };
    const results = await adapter.search({ vector: [0.1], topK: 3 });
    expect(results[0].documentId).toBe('doc-1');
  });

  it('should handle empty data', async () => {
    mockQueryResult = { data: null, error: null };
    const results = await adapter.search({ vector: [0.1], topK: 3 });
    expect(results).toHaveLength(0);
  });

  it('should handle null fields with nullish coalescing fallbacks', async () => {
    mockQueryResult = {
      data: [{ id: null, document_id: null, content: null, similarity: null, score: null }],
      error: null,
    };
    const results = await adapter.search({ vector: [0.1], topK: 3 });
    expect(results[0].chunkId).toBe('');
    expect(results[0].documentId).toBe('');
    expect(results[0].content).toBe('');
    expect(results[0].score).toBe(0);
  });
});

describe('upsertPoint', () => {
  beforeEach(async () => {
    await adapter.initialize();
  });

  it('should upsert with correct fields', async () => {
    mockQueryResult = { data: null, error: null };
    await adapter.upsertPoint({
      id: 'p1',
      vector: [0.1, 0.2],
      payload: { content: 'hello', documentId: 'doc1' },
    });
    const query = mockFrom.mock.results[0]?.value;
    expect(query.upsert).toHaveBeenCalledWith({
      id: 'p1',
      embedding: [0.1, 0.2],
      content: 'hello',
      document_id: 'doc1',
      metadata: { content: 'hello', documentId: 'doc1' },
    });
  });

  it('should throw on error', async () => {
    mockQueryResult = { data: null, error: { message: 'duplicate key' } };
    await expect(adapter.upsertPoint({ id: 'p1', vector: [0.1], payload: {} })).rejects.toThrow(
      'Supabase upsert failed',
    );
  });

  it('should handle missing payload fields', async () => {
    mockQueryResult = { data: null, error: null };
    await adapter.upsertPoint({ id: 'p1', vector: [0.1], payload: {} });
    const query = mockFrom.mock.results[mockFrom.mock.results.length - 1]?.value;
    expect(query.upsert).toHaveBeenCalledWith({
      id: 'p1',
      embedding: [0.1],
      content: '',
      document_id: '',
      metadata: {},
    });
  });
});

describe('upsertBatch', () => {
  beforeEach(async () => {
    await adapter.initialize();
  });

  it('should upsert points in a single batch', async () => {
    mockQueryResult = { data: null, error: null };
    const points = Array.from({ length: 3 }, (_, i) => ({
      id: `p${i}`,
      vector: [0.1],
      payload: { content: `doc${i}` },
    }));
    await adapter.upsertBatch(points);
    const query = mockFrom.mock.results[0]?.value;
    expect(query.upsert).toHaveBeenCalledTimes(1);
    expect(query.upsert.mock.calls[0][0]).toHaveLength(3);
  });

  it('should split into multiple batches when exceeding maxBatchSize', async () => {
    mockQueryResult = { data: null, error: null };
    const points = Array.from({ length: 600 }, (_, i) => ({
      id: `p${i}`,
      vector: [0.1],
      payload: { content: `doc${i}` },
    }));
    await adapter.upsertBatch(points);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('should throw on batch error', async () => {
    mockQueryResult = { data: null, error: { message: 'timeout' } };
    const points = Array.from({ length: 3 }, (_, i) => ({
      id: `p${i}`,
      vector: [0.1],
      payload: {},
    }));
    await expect(adapter.upsertBatch(points)).rejects.toThrow('Supabase batch upsert failed');
  });
});

describe('deleteCollection', () => {
  it('should throw unsupported error', async () => {
    await expect(adapter.deleteCollection('test')).rejects.toThrow(
      'Supabase does not support collection management',
    );
  });

  it('should throw whether initialized or not', async () => {
    await adapter.initialize();
    await expect(adapter.deleteCollection('test')).rejects.toThrow(
      'Supabase does not support collection management',
    );
  });
});

describe('getCollectionInfo', () => {
  beforeEach(async () => {
    await adapter.initialize();
  });

  it('should return stats with count', async () => {
    mockQueryResult = { count: 42, error: null };
    const stats = await adapter.getCollectionInfo('test');
    expect(stats).toEqual({
      collectionName: 'test',
      vectorCount: 42,
      vectorDimension: 1536,
    });
  });

  it('should return vectorCount 0 when count is null', async () => {
    mockQueryResult = { count: null, error: null };
    const stats = await adapter.getCollectionInfo('test');
    expect(stats?.vectorCount).toBe(0);
  });

  it('should return null when error', async () => {
    mockQueryResult = { count: null, error: { message: 'error' } };
    const stats = await adapter.getCollectionInfo('test');
    expect(stats).toBeNull();
  });

  it('should return null on exception', async () => {
    (mockFrom as any).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const stats = await adapter.getCollectionInfo('test');
    expect(stats).toBeNull();
  });
});

describe('listCollections', () => {
  beforeEach(async () => {
    await adapter.initialize();
  });

  it('should return table names', async () => {
    mockQueryResult = { data: ['docs', 'vectors'], error: null };
    const tables = await adapter.listCollections();
    expect(tables).toEqual(['docs', 'vectors']);
  });

  it('should return empty array on error', async () => {
    mockQueryResult = { data: null, error: { message: 'error' } };
    const tables = await adapter.listCollections();
    expect(tables).toEqual([]);
  });

  it('should handle null data in listCollections', async () => {
    mockQueryResult = { data: null, error: null };
    const tables = await adapter.listCollections();
    expect(tables).toEqual([]);
  });

  it('should return empty array on exception', async () => {
    mockSupabaseClient.rpc = vi.fn(() => {
      throw new Error('rpc error');
    }) as any;
    const tables = await adapter.listCollections();
    expect(tables).toEqual([]);
    mockSupabaseClient.rpc = mockRpc;
  });
});

describe('healthCheck', () => {
  beforeEach(async () => {
    await adapter.initialize();
  });

  it('should return true when healthy', async () => {
    mockQueryResult = { error: null };
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(true);
  });

  it('should return false when error', async () => {
    mockQueryResult = { error: { message: 'error' } };
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(false);
  });

  it('should return false on exception', async () => {
    mockFrom.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(false);
  });
});

describe('close', () => {
  it('should not throw', async () => {
    await expect(adapter.close()).resolves.toBeUndefined();
  });
});

describe('scanPoints', () => {
  beforeEach(async () => {
    await adapter.initialize();
  });

  it('should scan from start without cursor', async () => {
    mockQueryResult = {
      data: [
        { id: '1', embedding: [0.1, 0.2], metadata: { title: 'doc1' } },
        { id: '2', embedding: [0.3, 0.4], metadata: { title: 'doc2' } },
      ],
      error: null,
    };
    const result = await adapter.scanPoints('docs');
    expect(result.points).toHaveLength(2);
    expect(result.points[0].id).toBe('1');
    expect(result.points[0].vector).toEqual([0.1, 0.2]);
    expect(result.points[0].payload).toEqual({ title: 'doc1' });
  });

  it('should use cursor offset', async () => {
    mockQueryResult = { data: [{ id: '50', embedding: [0.5], metadata: {} }], error: null };
    await adapter.scanPoints('docs', { cursor: '50' });
    const query = mockFrom.mock.results[0]?.value;
    expect(query.range).toHaveBeenCalledWith(50, 149);
  });

  it('should return nextCursor when results fill batch', async () => {
    mockQueryResult = {
      data: Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        embedding: [0.1],
        metadata: {},
      })),
      error: null,
    };
    const result = await adapter.scanPoints('docs', { batchSize: 100 });
    expect(result.nextCursor).toBe('100');
  });

  it('should not return nextCursor when results under batchSize', async () => {
    mockQueryResult = {
      data: Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        embedding: [0.1],
        metadata: {},
      })),
      error: null,
    };
    const result = await adapter.scanPoints('docs', { batchSize: 100 });
    expect(result.nextCursor).toBeUndefined();
  });

  it('should throw on error', async () => {
    mockQueryResult = { data: null, error: { message: 'scan failed' } };
    await expect(adapter.scanPoints('docs')).rejects.toThrow('Supabase scan failed');
  });

  it('should default batchSize to 100', async () => {
    mockQueryResult = { data: [], error: null };
    await adapter.scanPoints('docs');
    const query = mockFrom.mock.results[0]?.value;
    expect(query.range).toHaveBeenCalledWith(0, 99);
  });

  it('should handle null data in scan', async () => {
    mockQueryResult = { data: null, error: null };
    const result = await adapter.scanPoints('docs');
    expect(result.points).toHaveLength(0);
  });

  it('should handle null fields in scan results', async () => {
    mockQueryResult = {
      data: [{ id: null, embedding: null, metadata: null }],
      error: null,
    };
    const result = await adapter.scanPoints('docs');
    expect(result.points[0].id).toBe('');
    expect(result.points[0].vector).toEqual([]);
    expect(result.points[0].payload).toEqual({});
  });
});

describe('ensureInitialized', () => {
  it('should throw when calling search before initialize', async () => {
    await expect(adapter.search({ vector: [0.1], topK: 3 })).rejects.toThrow('not initialized');
  });

  it('should throw when calling upsertPoint before initialize', async () => {
    await expect(adapter.upsertPoint({ id: 'p1', vector: [0.1], payload: {} })).rejects.toThrow(
      'not initialized',
    );
  });

  it('should throw when calling upsertBatch before initialize', async () => {
    await expect(adapter.upsertBatch([])).rejects.toThrow('not initialized');
  });

  it('should throw when calling scanPoints before initialize', async () => {
    await expect(adapter.scanPoints('docs')).rejects.toThrow('not initialized');
  });
});

describe('filter translation', () => {
  it('should handle $and logical filter', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, {
      $and: [{ status: { $eq: 'active' } }, { priority: { $gte: 3 } }],
    });
    expect(calls).toContainEqual(['eq', 'metadata->>status', 'active']);
    expect(calls).toContainEqual(['gte', 'metadata->>priority', 3]);
  });

  it('should handle $or logical filter', () => {
    const query = makeFilterTracker([]);
    (adapter as any).applySupabaseFilter(query, {
      $or: [{ status: { $eq: 'pending' } }, { status: { $eq: 'active' } }],
    });
    expect(query.or).toHaveBeenCalled();
    const orArg = (query.or.mock.calls[0] as unknown[])[0] as string;
    expect(orArg).toContain('metadata->>status.eq."pending"');
    expect(orArg).toContain('metadata->>status.eq."active"');
  });

  it('should handle $ne operator', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, {
      status: { $ne: 'archived' },
    });
    expect(calls).toContainEqual(['neq', 'metadata->>status', 'archived']);
  });

  it('should handle $nin operator', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, {
      status: { $nin: ['deleted', 'archived'] },
    });
    expect(calls).toContainEqual(['not', 'metadata->>status', 'in', '("deleted","archived")']);
  });

  it('should handle $gt operator', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { age: { $gt: 18 } });
    expect(calls).toContainEqual(['gt', 'metadata->>age', 18]);
  });

  it('should handle $lt operator', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { age: { $lt: 65 } });
    expect(calls).toContainEqual(['lt', 'metadata->>age', 65]);
  });

  it('should handle $lte operator', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { age: { $lte: 100 } });
    expect(calls).toContainEqual(['lte', 'metadata->>age', 100]);
  });

  it('should handle direct value (eq)', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { department: 'engineering' });
    expect(calls).toContainEqual(['eq', 'metadata->>department', 'engineering']);
  });

  it('should handle null value as is null', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { deletedAt: null });
    expect(calls).toContainEqual(['is', 'metadata->>deletedAt', null]);
  });

  it('should handle undefined value as is null', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { deletedAt: undefined });
    expect(calls).toContainEqual(['is', 'metadata->>deletedAt', null]);
  });

  it('should handle $exists false', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { deletedAt: { $exists: false } });
    expect(calls).toContainEqual(['is', 'metadata->>deletedAt', null]);
  });

  it('should handle $exists true', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { active: { $exists: true } });
    expect(calls).toContainEqual(['not', 'metadata->>active', 'is', null]);
  });

  it('should handle known field name directly without metadata prefix', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { id: { $eq: '123' } });
    expect(calls).toContainEqual(['eq', 'id', '123']);
  });

  it('should handle $in operator', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, { tier: { $in: ['pro', 'enterprise'] } });
    expect(calls).toContainEqual(['in', 'metadata->>tier', ['pro', 'enterprise']]);
  });

  it('should handle $or clause with string escaping', () => {
    const calls: unknown[][] = [];
    const query = makeFilterTracker(calls);
    (adapter as any).applySupabaseFilter(query, {
      $or: [{ name: { $eq: 'test"quote' } }],
    });
    const orArg = (query.or.mock.calls[0] as unknown[])[0] as string;
    expect(orArg).toContain('"test\\"quote"');
  });
});

describe('buildSupabaseOrClause', () => {
  it('should build a simple eq clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({ status: { $eq: 'active' } });
    expect(result).toBe('metadata->>status.eq."active"');
  });

  it('should build combined and clause with multiple conditions', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      status: { $eq: 'active' },
      priority: { $gte: 3 },
    });
    expect(result).toContain('and(');
    expect(result).toContain('metadata->>status.eq."active"');
    expect(result).toContain('metadata->>priority.gte.3');
  });

  it('should handle $and inside or clause building', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      $and: [{ status: { $eq: 'active' } }, { priority: { $gte: 3 } }],
    });
    expect(result).toBe('and(metadata->>status.eq."active",metadata->>priority.gte.3)');
  });

  it('should handle $or inside or clause building', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      $or: [{ status: { $eq: 'pending' } }, { status: { $eq: 'failed' } }],
    });
    expect(result).toBe('or(metadata->>status.eq."pending",metadata->>status.eq."failed")');
  });

  it('should handle $nin in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      status: { $nin: ['deleted', 'archived'] },
    });
    expect(result).toBe('not.metadata->>status.in.("deleted","archived")');
  });

  it('should handle $exists false in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({ deletedAt: { $exists: false } });
    expect(result).toBe('metadata->>deletedAt.is.null');
  });

  it('should handle $exists true in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({ active: { $exists: true } });
    expect(result).toBe('not.metadata->>active.is.null');
  });

  it('should handle $ne in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({ status: { $ne: 'archived' } });
    expect(result).toBe('metadata->>status.neq."archived"');
  });

  it('should handle $gt/$lt/$lte in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      age: { $gt: 18 },
      score: { $lte: 100 },
    });
    expect(result).toContain('metadata->>age.gt.18');
    expect(result).toContain('score.lte.100');
  });

  it('should handle $gte in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      priority: { $gte: 5 },
    });
    expect(result).toBe('metadata->>priority.gte.5');
  });

  it('should handle $lt in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      age: { $lt: 21 },
    });
    expect(result).toBe('metadata->>age.lt.21');
  });

  it('should handle null value in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({ deletedAt: null });
    expect(result).toBe('metadata->>deletedAt.is.null');
  });

  it('should handle direct value in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({ role: 'admin' });
    expect(result).toBe('metadata->>role.eq."admin"');
  });

  it('should handle $in operator in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      status: { $in: ['active', 'pending'] },
    });
    expect(result).toBe('metadata->>status.in.("active","pending")');
  });

  it('should handle $eq null in or clause (postgrestValue null)', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      deletedAt: { $eq: null },
    });
    expect(result).toBe('metadata->>deletedAt.eq.null');
  });

  it('should handle direct numeric value in or clause (postgrestValue String)', () => {
    const result = (adapter as any).buildSupabaseOrClause({ priority: 42 });
    expect(result).toBe('metadata->>priority.eq.42');
  });

  it('should handle $in with numbers in or clause', () => {
    const result = (adapter as any).buildSupabaseOrClause({
      priority: { $in: [1, 2, 3] },
    });
    expect(result).toBe('metadata->>priority.in.(1,2,3)');
  });
});

describe('schema support', () => {
  it('should use schema when configured', async () => {
    const schemaAdapter = new SupabaseVectorClientWrapper(schemaConfig);
    await schemaAdapter.initialize();
    mockQueryResult = { data: [{ id: '1', content: 'test', similarity: 0.9 }], error: null };
    await schemaAdapter.search({ vector: [0.1], topK: 3 });
    expect(mockSchema).toHaveBeenCalledWith('custom_schema');
  });

  it('should use schema for table operations', async () => {
    const schemaAdapter = new SupabaseVectorClientWrapper(schemaConfig);
    await schemaAdapter.initialize();
    mockQueryResult = { error: null };
    await schemaAdapter.healthCheck();
    expect(mockSchema).toHaveBeenCalledWith('custom_schema');
  });
});

function makeFilterTracker(calls: unknown[][]) {
  return {
    eq: (...args: unknown[]) => {
      calls.push(['eq', ...args]);
      return makeFilterTracker(calls);
    },
    neq: (...args: unknown[]) => {
      calls.push(['neq', ...args]);
      return makeFilterTracker(calls);
    },
    in: (...args: unknown[]) => {
      calls.push(['in', ...args]);
      return makeFilterTracker(calls);
    },
    not: (...args: unknown[]) => {
      calls.push(['not', ...args]);
      return makeFilterTracker(calls);
    },
    gt: (...args: unknown[]) => {
      calls.push(['gt', ...args]);
      return makeFilterTracker(calls);
    },
    gte: (...args: unknown[]) => {
      calls.push(['gte', ...args]);
      return makeFilterTracker(calls);
    },
    lt: (...args: unknown[]) => {
      calls.push(['lt', ...args]);
      return makeFilterTracker(calls);
    },
    lte: (...args: unknown[]) => {
      calls.push(['lte', ...args]);
      return makeFilterTracker(calls);
    },
    is: (...args: unknown[]) => {
      calls.push(['is', ...args]);
      return makeFilterTracker(calls);
    },
    or: vi.fn(() => makeFilterTracker(calls)),
  };
}

import type { VectorStoreConfig } from '@reaatech/hybrid-rag';
import { VectorStoreOperationError } from '@reaatech/hybrid-rag';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MigrationResult } from './migration.js';
import { exportVectors, importVectors, migrateVectors } from './migration.js';

const sharedMocks = {
  scanPoints: vi.fn(),
  getCollectionInfo: vi.fn(),
  upsertBatch: vi.fn(),
  initialize: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  close: vi.fn(),
};

function createMockAdapter(provider: string, overrides: Record<string, any> = {}) {
  return {
    provider,
    capabilities: {
      supportsScan: true,
      supportsFilter: true,
      supportsBM25: false,
      supportsPayloadFilter: false,
      supportsMultiVector: false,
    },
    costModel: { provider, costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    scanPoints: sharedMocks.scanPoints,
    getCollectionInfo: sharedMocks.getCollectionInfo.mockResolvedValue({
      vectorDimension: 1536,
      totalPoints: 0,
      collectionName: 'documents',
    }),
    upsertBatch: sharedMocks.upsertBatch.mockResolvedValue(undefined),
    initialize: sharedMocks.initialize.mockResolvedValue(undefined),
    healthCheck: sharedMocks.healthCheck,
    close: sharedMocks.close,
    search: vi.fn(),
    upsertPoint: vi.fn(),
    deleteCollection: vi.fn(),
    listCollections: vi.fn(),
    ...overrides,
  };
}

let createdStores: any[] = [];

vi.mock('@reaatech/hybrid-rag-retrieval', () => ({
  createVectorStore: vi.fn().mockImplementation(async (config: any) => {
    const store = createMockAdapter(config.provider ?? 'sandbox');
    createdStores.push(store);
    return store;
  }),
}));

const retrievalMock = await import('@reaatech/hybrid-rag-retrieval');

const mockFs = vi.hoisted(() => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => mockFs);

const _fsPromises = await import('node:fs/promises');

function makeConfig(overrides: Record<string, unknown> = {}): VectorStoreConfig {
  return {
    provider: 'sandbox',
    collectionName: 'documents',
    vectorSize: 1536,
    ...overrides,
  } as unknown as VectorStoreConfig;
}

describe('migrateVectors', () => {
  const sourceConfig = makeConfig();
  const targetConfig = makeConfig();

  beforeEach(() => {
    vi.clearAllMocks();
    createdStores = [];
    sharedMocks.scanPoints.mockReset();
    sharedMocks.upsertBatch.mockReset();
    sharedMocks.getCollectionInfo.mockReset();
    sharedMocks.initialize.mockReset();
  });

  it('should return a MigrationResult with expected shape', async () => {
    const result = await migrateVectors(sourceConfig, targetConfig, { dryRun: true });

    expect(result).toHaveProperty('sourceProvider');
    expect(result).toHaveProperty('targetProvider');
    expect(result).toHaveProperty('pointsMigrated');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('durationMs');
    expect(typeof result.sourceProvider).toBe('string');
    expect(typeof result.targetProvider).toBe('string');
    expect(typeof result.pointsMigrated).toBe('number');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });

  it('should return zero points for dryRun', async () => {
    const result = await migrateVectors(sourceConfig, targetConfig, { dryRun: true });

    expect(result.pointsMigrated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBe(0);
  });

  it('should call scanPoints on source when not dryRun and scan returns empty', async () => {
    sharedMocks.scanPoints.mockResolvedValueOnce({
      points: [],
      nextCursor: undefined,
    });

    const result = await migrateVectors(sourceConfig, targetConfig);

    expect(result.pointsMigrated).toBeGreaterThanOrEqual(0);
  });

  it('should validate dimensions when validateDimensions is set and dimensions match', async () => {
    await migrateVectors(sourceConfig, targetConfig, {
      dryRun: true,
      validateDimensions: true,
    });

    expect(sharedMocks.getCollectionInfo).toHaveBeenCalled();
  });

  it('should throw for mismatched dimensions', async () => {
    sharedMocks.getCollectionInfo
      .mockResolvedValueOnce({ vectorDimension: 768, totalPoints: 0, collectionName: 'documents' })
      .mockResolvedValueOnce({
        vectorDimension: 1536,
        totalPoints: 0,
        collectionName: 'documents',
      });

    await expect(
      migrateVectors(sourceConfig, targetConfig, { validateDimensions: true }),
    ).rejects.toThrow('Vector dimension mismatch');
  });

  it('should throw VectorStoreOperationError when source lacks scanPoints support', async () => {
    (retrievalMock.createVectorStore as any).mockImplementationOnce(async () => ({
      provider: 'sandbox',
      capabilities: {},
      costModel: {},
      initialize: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
      getCollectionInfo: vi.fn(),
      upsertBatch: vi.fn(),
    }));

    await expect(
      migrateVectors({ provider: 'sandbox' } as VectorStoreConfig, targetConfig),
    ).rejects.toThrow(VectorStoreOperationError);
  });

  it('should iterate multiple scan pages with cursor', async () => {
    sharedMocks.scanPoints
      .mockResolvedValueOnce({
        points: Array.from({ length: 50 }, (_, i) => ({
          id: `p${i}`,
          vector: new Array(1536).fill(0),
          payload: {},
        })),
        nextCursor: '50',
      })
      .mockResolvedValueOnce({
        points: Array.from({ length: 25 }, (_, i) => ({
          id: `p${i + 50}`,
          vector: new Array(1536).fill(0),
          payload: {},
        })),
        nextCursor: undefined,
      });

    const result = await migrateVectors(sourceConfig, targetConfig);

    expect(result.pointsMigrated).toBe(75);
    expect(sharedMocks.scanPoints).toHaveBeenCalledTimes(2);
    expect(sharedMocks.upsertBatch).toHaveBeenCalledTimes(2);
  });

  it('should continue past empty scan when followed by data', async () => {
    sharedMocks.scanPoints
      .mockResolvedValueOnce({ points: [], nextCursor: '25' })
      .mockResolvedValueOnce({
        points: [{ id: 'p1', vector: new Array(1536).fill(0), payload: {} }],
        nextCursor: undefined,
      });

    const result = await migrateVectors(sourceConfig, targetConfig);

    expect(result.pointsMigrated).toBe(1);
  });

  it('should skip empty scan page without calling upsertBatch', async () => {
    sharedMocks.scanPoints.mockResolvedValueOnce({
      points: [],
      nextCursor: undefined,
    });

    const result = await migrateVectors(sourceConfig, targetConfig);

    expect(result.pointsMigrated).toBe(0);
    expect(sharedMocks.upsertBatch).not.toHaveBeenCalled();
  });

  it('should stop migrating when maxErrors reached after continueOnError with multiple points', async () => {
    sharedMocks.scanPoints.mockResolvedValueOnce({
      points: Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        vector: new Array(1536).fill(0),
        payload: {},
      })),
      nextCursor: undefined,
    });
    sharedMocks.upsertBatch.mockRejectedValueOnce(new Error('batch failed'));

    const result = await migrateVectors(sourceConfig, targetConfig, {
      continueOnError: true,
      maxErrors: 3,
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.length).toBeLessThanOrEqual(3);
  });
});

describe('MigrationResult type', () => {
  it('should conform to expected shape when constructed manually', () => {
    const result: MigrationResult = {
      sourceProvider: 'qdrant',
      targetProvider: 'pinecone',
      pointsMigrated: 100,
      errors: [{ pointId: 'p1', error: 'timeout' }],
      durationMs: 1234,
    };

    expect(result.sourceProvider).toBe('qdrant');
    expect(result.targetProvider).toBe('pinecone');
    expect(result.pointsMigrated).toBe(100);
    expect(result.errors).toHaveLength(1);
    expect(result.durationMs).toBe(1234);
  });
});

describe('exportVectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdStores = [];
    sharedMocks.scanPoints.mockReset();
    sharedMocks.upsertBatch.mockReset();
    sharedMocks.getCollectionInfo.mockReset();
    sharedMocks.initialize.mockReset();
  });

  it('should exist as a function', () => {
    expect(typeof exportVectors).toBe('function');
  });

  it('should throw VectorStoreOperationError when source lacks scanPoints', async () => {
    (retrievalMock.createVectorStore as any).mockImplementationOnce(async () => ({
      provider: 'sandbox',
      capabilities: {},
      costModel: {},
      initialize: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    }));

    await expect(
      exportVectors({ provider: 'sandbox' } as VectorStoreConfig, '/tmp/test-export.jsonl'),
    ).rejects.toThrow(VectorStoreOperationError);
  });

  it('should write metadata header and points with single page', async () => {
    sharedMocks.scanPoints.mockResolvedValueOnce({
      points: [{ id: 'p1', vector: [0.1, 0.2], payload: { text: 'hello' } }],
      nextCursor: undefined,
    });

    await exportVectors(makeConfig(), '/tmp/export.jsonl', { dimension: 1536 });

    expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/export.jsonl', expect.any(String), {
      mode: 0o600,
    });
    const headerLine = mockFs.writeFile.mock.calls[0][1] as string;
    const header = JSON.parse(headerLine);
    expect(header.type).toBe('metadata');
    expect(header.format).toBe('hybrid-rag-vector-export');
    expect(header.version).toBe('2.0.0');
    expect(header.provider).toBe('sandbox');
    expect(header.collection).toBe('documents');
    expect(header.dimension).toBe(1536);
    expect(header.exportedAt).toBeDefined();

    expect(mockFs.appendFile).toHaveBeenCalledWith('/tmp/export.jsonl', expect.any(String));
    const dataContent = mockFs.appendFile.mock.calls[0][1] as string;
    expect(dataContent).toContain('"type":"point"');
    expect(dataContent).toContain('"id":"p1"');
  });

  it('should iterate multiple scan pages with cursor', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`,
      vector: [0.1],
      payload: {},
    }));
    const page2 = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i + 50}`,
      vector: [0.1],
      payload: {},
    }));

    sharedMocks.scanPoints
      .mockResolvedValueOnce({ points: page1, nextCursor: '50' })
      .mockResolvedValueOnce({ points: page2, nextCursor: undefined });

    await exportVectors(makeConfig(), '/tmp/export.jsonl');

    expect(sharedMocks.scanPoints).toHaveBeenCalledTimes(2);
    expect(mockFs.appendFile).toHaveBeenCalledTimes(2);
  });

  it('should use custom collection and batch size', async () => {
    sharedMocks.scanPoints.mockResolvedValueOnce({ points: [], nextCursor: undefined });

    await exportVectors(makeConfig({ collectionName: 'custom' }), '/tmp/export.jsonl', {
      collection: 'custom',
      batchSize: 50,
    });

    expect(sharedMocks.scanPoints).toHaveBeenCalledWith('custom', {
      batchSize: 50,
      cursor: undefined,
    });
  });
});

describe('importVectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdStores = [];
    sharedMocks.scanPoints.mockReset();
    sharedMocks.upsertBatch.mockReset();
    sharedMocks.getCollectionInfo.mockReset();
    sharedMocks.initialize.mockReset();
  });

  it('should exist as a function', () => {
    expect(typeof importVectors).toBe('function');
  });

  it('should throw for empty file', () => {
    mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
    return expect(
      importVectors({ provider: 'sandbox' } as VectorStoreConfig, '/nonexistent/empty-file.jsonl'),
    ).rejects.toThrow();
  });

  it('should throw for invalid export format', async () => {
    mockFs.readFile.mockResolvedValueOnce('{"type":"unknown"}\n');

    await expect(
      importVectors({ provider: 'sandbox' } as VectorStoreConfig, '/tmp/invalid.jsonl'),
    ).rejects.toThrow('Invalid export file format');
  });

  it('should parse valid export and upsert points', async () => {
    mockFs.readFile.mockResolvedValueOnce(
      [
        JSON.stringify({
          type: 'metadata',
          format: 'hybrid-rag-vector-export',
          version: '2.0.0',
          provider: 'qdrant',
          collection: 'docs',
          dimension: 2,
          exportedAt: '2024-01-01T00:00:00.000Z',
        }),
        JSON.stringify({
          type: 'point',
          point: { id: 'p1', vector: [0.1, 0.2], payload: { text: 'doc1' } },
        }),
        JSON.stringify({
          type: 'point',
          point: { id: 'p2', vector: [0.3, 0.4], payload: { text: 'doc2' } },
        }),
      ].join('\n'),
    );

    const result = await importVectors(makeConfig(), '/tmp/export.jsonl');

    expect(result.pointsMigrated).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(sharedMocks.upsertBatch).toHaveBeenCalledTimes(1);
    expect(result.targetProvider).toBe('sandbox');
    expect(result.sourceProvider).toBe('export');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should batch points and flush trailing batch', async () => {
    const points = Array.from({ length: 250 }, (_, i) => ({
      id: `p${i}`,
      vector: [0.1],
      payload: { idx: i },
    }));
    const meta = JSON.stringify({
      type: 'metadata',
      format: 'hybrid-rag-vector-export',
      version: '2.0.0',
      provider: 'qdrant',
      collection: 'docs',
      dimension: 2,
      exportedAt: '2024-01-01T00:00:00.000Z',
    });
    const lines = [meta, ...points.map((p) => JSON.stringify({ type: 'point', point: p }))];
    mockFs.readFile.mockResolvedValueOnce(lines.join('\n'));

    const result = await importVectors(makeConfig(), '/tmp/export.jsonl', { batchSize: 100 });

    expect(result.pointsMigrated).toBe(250);
    expect(sharedMocks.upsertBatch).toHaveBeenCalledTimes(3);
  });

  it('should handle continueOnError with parse failures', async () => {
    const meta = JSON.stringify({
      type: 'metadata',
      format: 'hybrid-rag-vector-export',
      version: '2.0.0',
      provider: 'qdrant',
      collection: 'docs',
      dimension: 2,
      exportedAt: '2024-01-01T00:00:00.000Z',
    });
    mockFs.readFile.mockResolvedValueOnce(
      [
        meta,
        'NOT JSON',
        JSON.stringify({ type: 'point', point: { id: 'p1', vector: [0.1], payload: {} } }),
      ].join('\n'),
    );

    const result = await importVectors(makeConfig(), '/tmp/export.jsonl', {
      continueOnError: true,
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].pointId).toBe('line-2');
    expect(result.pointsMigrated).toBe(1);
  });

  it('should throw on parse failure without continueOnError', async () => {
    const meta = JSON.stringify({
      type: 'metadata',
      format: 'hybrid-rag-vector-export',
      version: '2.0.0',
      provider: 'qdrant',
      collection: 'docs',
      dimension: 2,
      exportedAt: '2024-01-01T00:00:00.000Z',
    });
    mockFs.readFile.mockResolvedValueOnce([meta, 'INVALID JSON'].join('\n'));

    await expect(importVectors(makeConfig(), '/tmp/export.jsonl')).rejects.toThrow(
      'Failed to parse line',
    );
  });

  it('should handle continueOnError with batch upsert failure', async () => {
    const meta = JSON.stringify({
      type: 'metadata',
      format: 'hybrid-rag-vector-export',
      version: '2.0.0',
      provider: 'qdrant',
      collection: 'docs',
      dimension: 2,
      exportedAt: '2024-01-01T00:00:00.000Z',
    });
    const points = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      vector: [0.1],
      payload: {},
    }));
    const lines = [meta, ...points.map((p) => JSON.stringify({ type: 'point', point: p }))];
    mockFs.readFile.mockResolvedValueOnce(lines.join('\n'));
    sharedMocks.upsertBatch.mockRejectedValueOnce(new Error('batch upsert failed'));

    const result = await importVectors(makeConfig(), '/tmp/export.jsonl', {
      continueOnError: true,
      batchSize: 5,
    });

    expect(result.errors.length).toBe(5);
    expect(result.pointsMigrated).toBe(0);
  });

  it('should throw on batch upsert failure without continueOnError', async () => {
    const meta = JSON.stringify({
      type: 'metadata',
      format: 'hybrid-rag-vector-export',
      version: '2.0.0',
      provider: 'qdrant',
      collection: 'docs',
      dimension: 2,
      exportedAt: '2024-01-01T00:00:00.000Z',
    });
    const lines = [
      meta,
      JSON.stringify({ type: 'point', point: { id: 'p1', vector: [0.1], payload: {} } }),
    ];
    mockFs.readFile.mockResolvedValueOnce(lines.join('\n'));
    sharedMocks.upsertBatch.mockRejectedValueOnce(new Error('batch upsert failed'));

    await expect(importVectors(makeConfig(), '/tmp/export.jsonl')).rejects.toThrow(
      'batch upsert failed',
    );
  });

  it('should skip empty lines', async () => {
    const meta = JSON.stringify({
      type: 'metadata',
      format: 'hybrid-rag-vector-export',
      version: '2.0.0',
      provider: 'qdrant',
      collection: 'docs',
      dimension: 2,
      exportedAt: '2024-01-01T00:00:00.000Z',
    });
    mockFs.readFile.mockResolvedValueOnce(
      [
        meta,
        '',
        JSON.stringify({ type: 'point', point: { id: 'p1', vector: [0.1], payload: {} } }),
        '  ',
        JSON.stringify({ type: 'point', point: { id: 'p2', vector: [0.1], payload: {} } }),
      ].join('\n'),
    );

    const result = await importVectors(makeConfig(), '/tmp/export.jsonl');

    expect(result.pointsMigrated).toBe(2);
  });

  it('should handle export with header-only (no points after metadata)', async () => {
    mockFs.readFile.mockResolvedValueOnce(
      `${JSON.stringify({
        type: 'metadata',
        format: 'hybrid-rag-vector-export',
        version: '2.0.0',
        provider: 'qdrant',
        collection: 'docs',
        dimension: 2,
        exportedAt: '2024-01-01T00:00:00.000Z',
      })}\n`,
    );

    const result = await importVectors(makeConfig(), '/tmp/export.jsonl');

    expect(result.pointsMigrated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('error handling', () => {
  const sourceConfig = makeConfig();
  const targetConfig = makeConfig();

  beforeEach(() => {
    vi.clearAllMocks();
    createdStores = [];
    sharedMocks.scanPoints.mockReset();
    sharedMocks.upsertBatch.mockReset();
    sharedMocks.getCollectionInfo.mockReset();
    sharedMocks.initialize.mockReset();
  });

  it('should collect errors and continue when continueOnError is set', async () => {
    sharedMocks.scanPoints.mockResolvedValueOnce({
      points: [
        { id: 'p1', vector: new Array(1536).fill(0), payload: {} },
        { id: 'p2', vector: new Array(1536).fill(0), payload: {} },
      ],
      nextCursor: undefined,
    });
    sharedMocks.upsertBatch.mockRejectedValueOnce(new Error('upsert failed'));

    const result = await migrateVectors(sourceConfig, targetConfig, {
      continueOnError: true,
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toHaveProperty('pointId');
    expect(result.errors[0]).toHaveProperty('error');
  });

  it('should re-throw batch failures when continueOnError is not set', async () => {
    sharedMocks.scanPoints.mockResolvedValueOnce({
      points: [{ id: 'p1', vector: new Array(1536).fill(0), payload: {} }],
      nextCursor: undefined,
    });
    sharedMocks.upsertBatch.mockRejectedValueOnce(new Error('upsert failed'));

    await expect(migrateVectors(sourceConfig, targetConfig)).rejects.toThrow('upsert failed');
  });

  it('should respect maxErrors limit', async () => {
    sharedMocks.scanPoints.mockResolvedValueOnce({
      points: [
        { id: 'p1', vector: new Array(1536).fill(0), payload: {} },
        { id: 'p2', vector: new Array(1536).fill(0), payload: {} },
        { id: 'p3', vector: new Array(1536).fill(0), payload: {} },
      ],
      nextCursor: undefined,
    });
    sharedMocks.upsertBatch.mockRejectedValueOnce(new Error('upsert failed'));

    const result = await migrateVectors(sourceConfig, targetConfig, {
      continueOnError: true,
      maxErrors: 2,
    });

    expect(result.errors.length).toBeLessThanOrEqual(2);
  });
});

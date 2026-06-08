import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  adminTools,
  ragCollections,
  ragConfig,
  ragDetectCapabilities,
  ragListProviders,
  ragSandbox,
  ragStatus,
  sandboxTools,
} from './admin.js';

const { getRegisteredProviders } = vi.hoisted(() => ({ getRegisteredProviders: vi.fn() }));
vi.mock('@reaatech/hybrid-rag-retrieval', () => ({
  getRegisteredProviders: () => getRegisteredProviders(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('admin registries', () => {
  it('exposes the expected admin and sandbox tools', () => {
    expect(adminTools.map((t) => t.name)).toEqual([
      'rag.status',
      'rag.collections',
      'rag.config',
      'rag.detect_capabilities',
      'rag.list_providers',
    ]);
    expect(sandboxTools.map((t) => t.name)).toEqual(['rag.sandbox']);
  });
});

describe('rag.status', () => {
  it('returns healthy status merged with stats', async () => {
    const pipeline = makePipeline({
      getStats: vi.fn().mockResolvedValue({ totalChunks: 5 }),
    });
    const res = await ragStatus.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.status).toBe('healthy');
    expect(payload.totalChunks).toBe(5);
  });

  it('reports errors as text', async () => {
    const pipeline = makePipeline({
      getStats: vi.fn().mockRejectedValue(new Error('stats failed')),
    });
    const res = await ragStatus.handler({}, pipeline);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('stats failed');
  });
});

describe('rag.collections', () => {
  const statsWithStores = {
    collectionName: 'documents',
    totalChunks: 10,
    totalDocuments: 2,
    vectorStores: [
      {
        collectionName: 'documents',
        vectorCount: 100,
        vectorDimension: 384,
        indexType: 'hnsw',
        diskUsageBytes: 1000,
      },
    ],
  };

  it('lists collections (default action)', async () => {
    const pipeline = makePipeline({
      getStats: vi.fn().mockResolvedValue(statsWithStores),
      getVectorStoreHealth: vi.fn().mockResolvedValue(true),
      getVectorStoreReadiness: vi.fn().mockResolvedValue({ provider: 'qdrant' }),
    });
    const res = await ragCollections.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.action).toBe('list');
    expect(payload.provider).toBe('qdrant');
    expect((payload.collections as unknown[]).length).toBe(1);
  });

  it('requires collectionName for delete', async () => {
    const res = await ragCollections.handler({ action: 'delete' }, makePipeline({}));
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('delete');
  });

  it('requires collectionName for info', async () => {
    const res = await ragCollections.handler({ action: 'info' }, makePipeline({}));
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('info');
  });

  it('returns info for a matching collection', async () => {
    const pipeline = makePipeline({
      getVectorStoreCapabilities: vi.fn().mockResolvedValue({ hybrid: true }),
      getVectorStoreReadiness: vi.fn().mockResolvedValue({ provider: 'qdrant' }),
      getVectorStoreStats: vi.fn().mockResolvedValue({ collectionName: 'documents' }),
    });
    const res = await ragCollections.handler(
      { action: 'info', collectionName: 'documents' },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.action).toBe('info');
    expect(payload.provider).toBe('qdrant');
  });

  it('errors when info collection is not found', async () => {
    const pipeline = makePipeline({
      getVectorStoreCapabilities: vi.fn().mockResolvedValue({}),
      getVectorStoreReadiness: vi.fn().mockResolvedValue({ provider: 'qdrant' }),
      getVectorStoreStats: vi.fn().mockResolvedValue({ collectionName: 'other' }),
    });
    const res = await ragCollections.handler(
      { action: 'info', collectionName: 'documents' },
      pipeline,
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).availableCollection).toBe('other');
  });

  it('handles info when stats helpers are missing', async () => {
    const res = await ragCollections.handler(
      { action: 'info', collectionName: 'documents' },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.action).toBe('info');
    expect(payload.provider).toBeUndefined();
  });

  it('returns delete guidance message', async () => {
    const res = await ragCollections.handler(
      { action: 'delete', collectionName: 'documents' },
      makePipeline({}),
    );
    expect(parseToolResult(res).message).toContain('direct database access');
  });

  it('errors for an unknown action', async () => {
    const res = await ragCollections.handler({ action: 'frobnicate' }, makePipeline({}));
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('Unknown action');
  });

  it('catches pipeline errors during list', async () => {
    const pipeline = makePipeline({
      getStats: vi.fn().mockRejectedValue(new Error('list failed')),
      getVectorStoreHealth: vi.fn(),
      getVectorStoreReadiness: vi.fn(),
    });
    const res = await ragCollections.handler({ action: 'list' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('list failed');
  });
});

describe('rag.config', () => {
  it('echoes config management args', async () => {
    const res = await ragConfig.handler(
      { action: 'set', key: 'topK', value: '10' },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.action).toBe('set');
    expect(payload.key).toBe('topK');
  });
});

describe('rag.detect_capabilities', () => {
  it('reports capabilities and stats from the pipeline', async () => {
    const pipeline = makePipeline({
      getVectorStoreCapabilities: vi.fn().mockResolvedValue({ provider: 'qdrant', hybrid: true }),
      getVectorStoreStats: vi.fn().mockResolvedValue({ vectorCount: 5 }),
    });
    const res = await ragDetectCapabilities.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.provider).toBe('qdrant');
    expect(payload.capabilities).toMatchObject({ hybrid: true });
    expect(payload.stats).toMatchObject({ vectorCount: 5 });
  });

  it('honors an explicit provider override and missing helpers', async () => {
    const res = await ragDetectCapabilities.handler({ provider: 'pinecone' }, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.provider).toBe('pinecone');
    expect(payload.capabilities).toEqual({});
    expect(payload.stats).toEqual({});
  });

  it('falls back to unknown provider when none can be derived', async () => {
    const pipeline = makePipeline({
      getVectorStoreCapabilities: vi.fn().mockResolvedValue(null),
      getVectorStoreStats: vi.fn().mockResolvedValue(null),
    });
    const res = await ragDetectCapabilities.handler({}, pipeline);
    expect(parseToolResult(res).provider).toBe('unknown');
  });

  it('handles thrown errors', async () => {
    const pipeline = makePipeline({
      getVectorStoreCapabilities: vi.fn().mockRejectedValue(new Error('cap fail')),
    });
    const res = await ragDetectCapabilities.handler({}, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('cap fail');
  });
});

describe('rag.list_providers', () => {
  it('merges registered providers with the built-in list', async () => {
    getRegisteredProviders.mockReturnValue(['qdrant', 'custom']);
    const res = await ragListProviders.handler({}, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.registered).toEqual(['qdrant', 'custom']);
    expect(payload.builtIn).toContain('sandbox');
  });

  it('returns an empty registered list when the retrieval module throws', async () => {
    getRegisteredProviders.mockImplementation(() => {
      throw new Error('no module');
    });
    const res = await ragListProviders.handler({}, makePipeline({}));
    expect(parseToolResult(res).registered).toEqual([]);
  });
});

describe('rag.sandbox', () => {
  it('returns deterministic mock results sized by topK', async () => {
    const res = await ragSandbox.handler({ query: 'hi', topK: 3 }, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.mode).toBe('sandbox');
    expect(payload.result_count).toBe(3);
    expect((payload.results as unknown[]).length).toBe(3);
  });

  it('defaults topK to 5', async () => {
    const res = await ragSandbox.handler({ query: 'hi' }, makePipeline({}));
    expect(parseToolResult(res).result_count).toBe(5);
  });
});

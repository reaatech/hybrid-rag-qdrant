import type { VectorStoreAdapter, VectorStoreConfig } from '@reaatech/hybrid-rag';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFromRegistry,
  getRegisteredProviders,
  hasProvider,
  registerVectorStore,
} from './vector-store-registry.js';

describe('VectorStoreRegistry', () => {
  beforeEach(() => {
    const registry = (globalThis as Record<string, unknown>).__registry;
    if (registry && typeof (registry as Map<unknown, unknown>).clear === 'function') {
      (registry as Map<unknown, unknown>).clear();
    }
  });

  it('should start with no registered providers', () => {
    expect(getRegisteredProviders()).toEqual([]);
  });

  it('should register a custom adapter constructor', () => {
    class MockCustomDb {
      provider = 'custom-db';
      capabilities = {} as any;
      costModel = {} as any;
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

    registerVectorStore('pinecone' as any, MockCustomDb as any);
    expect(getRegisteredProviders()).toContain('pinecone');
  });

  it('should check if a provider is registered', () => {
    class MockCtor {
      provider = 'qdrant';
      capabilities = {} as any;
      costModel = {} as any;
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

    registerVectorStore('qdrant', MockCtor as any);
    expect(hasProvider('qdrant')).toBe(true);
    expect(hasProvider('unknown')).toBe(false);
  });

  it('should create adapter from registry', () => {
    const mockAdapter: VectorStoreAdapter = {
      provider: 'pinecone',
      capabilities: {
        supportsHybridSearch: true,
        supportsMetadataFiltering: true,
        supportsBatchUpsert: true,
        supportsCollectionManagement: false,
        supportsMultiTenancy: true,
        supportsQuantization: false,
        supportsScan: false,
        maxBatchSize: 100,
        maxVectorDimension: 20000,
      },
      costModel: {
        costPerQueryEstimate: 0.00001,
        costPer1000Upserts: 0.01,
        monthlyBaseCost: 70,
      },
      initialize: vi.fn(),
      search: vi.fn(),
      upsertPoint: vi.fn(),
      upsertBatch: vi.fn(),
      deleteCollection: vi.fn(),
      getCollectionInfo: vi.fn(),
      listCollections: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };

    class MockCtor {
      provider = 'pinecone';
      capabilities = mockAdapter.capabilities;
      costModel = mockAdapter.costModel;
      initialize = mockAdapter.initialize;
      search = mockAdapter.search;
      upsertPoint = mockAdapter.upsertPoint;
      upsertBatch = mockAdapter.upsertBatch;
      deleteCollection = mockAdapter.deleteCollection;
      getCollectionInfo = mockAdapter.getCollectionInfo;
      listCollections = mockAdapter.listCollections;
      healthCheck = mockAdapter.healthCheck;
      close = mockAdapter.close;
    }
    registerVectorStore('pinecone', MockCtor as any);

    const config: VectorStoreConfig = {
      provider: 'pinecone',
      apiKey: 'test-key',
      indexName: 'my-index',
    };

    const adapter = createFromRegistry(config);
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe('pinecone');
  });

  it('should throw when provider not registered', () => {
    const config: VectorStoreConfig = {
      provider: 'nonexistent',
      apiKey: 'test',
      indexName: 'test',
    } as any;
    expect(() => createFromRegistry(config)).toThrow('is not registered');
  });
});

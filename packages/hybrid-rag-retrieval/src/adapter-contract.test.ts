import type { VectorStoreAdapter, VectorStoreProvider } from '@reaatech/hybrid-rag';
import { AzureAISearchClientWrapper } from '@reaatech/hybrid-rag-azure-ai-search';
import { ChromaClientWrapper } from '@reaatech/hybrid-rag-chroma';
import { ElasticsearchClientWrapper } from '@reaatech/hybrid-rag-elasticsearch';
import { LanceDBClientWrapper } from '@reaatech/hybrid-rag-lancedb';
import { MilvusClientWrapper } from '@reaatech/hybrid-rag-milvus';
import { MongoDBVectorClientWrapper } from '@reaatech/hybrid-rag-mongodb';
import { OpenSearchClientWrapper } from '@reaatech/hybrid-rag-opensearch';
import { PgVectorClientWrapper } from '@reaatech/hybrid-rag-pgvector';
import { PineconeClientWrapper } from '@reaatech/hybrid-rag-pinecone';
import { QdrantClientWrapper } from '@reaatech/hybrid-rag-qdrant';
import { RedisVectorClientWrapper } from '@reaatech/hybrid-rag-redis';
import { SupabaseVectorClientWrapper } from '@reaatech/hybrid-rag-supabase';
import { VespaClientWrapper } from '@reaatech/hybrid-rag-vespa';
import { WeaviateClientWrapper } from '@reaatech/hybrid-rag-weaviate';
import { describe, expect, it } from 'vitest';
import { SandboxVectorStore } from './sandbox-store.js';

interface ContractCase {
  provider: VectorStoreProvider;
  create: () => VectorStoreAdapter;
  supportsHybridSearch: boolean;
  supportsScan: boolean;
}

function expectAdapterContract(adapter: VectorStoreAdapter, expectedProvider: VectorStoreProvider) {
  expect(adapter.provider).toBe(expectedProvider);

  for (const methodName of [
    'initialize',
    'search',
    'upsertPoint',
    'upsertBatch',
    'deleteCollection',
    'getCollectionInfo',
    'listCollections',
    'healthCheck',
    'close',
  ] as const) {
    expect(typeof adapter[methodName], `${expectedProvider}.${methodName}`).toBe('function');
  }

  expect(typeof adapter.capabilities.supportsHybridSearch).toBe('boolean');
  expect(typeof adapter.capabilities.supportsMetadataFiltering).toBe('boolean');
  expect(typeof adapter.capabilities.supportsBatchUpsert).toBe('boolean');
  expect(typeof adapter.capabilities.supportsCollectionManagement).toBe('boolean');
  expect(typeof adapter.capabilities.supportsMultiTenancy).toBe('boolean');
  expect(typeof adapter.capabilities.supportsQuantization).toBe('boolean');
  expect(typeof adapter.capabilities.supportsScan).toBe('boolean');
  expect(adapter.capabilities.maxBatchSize).toBeGreaterThan(0);
  expect(adapter.capabilities.maxVectorDimension).toBeGreaterThan(0);

  expect(adapter.costModel.costPerQueryEstimate).toBeGreaterThanOrEqual(0);
  expect(adapter.costModel.costPer1000Upserts).toBeGreaterThanOrEqual(0);
  if (adapter.costModel.monthlyBaseCost !== undefined) {
    expect(adapter.costModel.monthlyBaseCost).toBeGreaterThanOrEqual(0);
  }
}

const contractCases: ContractCase[] = [
  {
    provider: 'qdrant',
    create: () =>
      new QdrantClientWrapper({
        url: 'http://localhost:6333',
        collectionName: 'documents',
        vectorSize: 1536,
      }),
    supportsHybridSearch: false,
    supportsScan: true,
  },
  {
    provider: 'pinecone',
    create: () => new PineconeClientWrapper({ apiKey: 'pc-key', indexName: 'documents' }),
    supportsHybridSearch: true,
    supportsScan: false,
  },
  {
    provider: 'weaviate',
    create: () =>
      new WeaviateClientWrapper({ url: 'http://localhost:8080', className: 'Document' }),
    supportsHybridSearch: true,
    supportsScan: true,
  },
  {
    provider: 'chroma',
    create: () =>
      new ChromaClientWrapper({ url: 'http://localhost:8000', collectionName: 'documents' }),
    supportsHybridSearch: false,
    supportsScan: true,
  },
  {
    provider: 'pgvector',
    create: () =>
      new PgVectorClientWrapper({
        connectionString: 'postgresql://user:pass@localhost:5432/rag',
        tableName: 'documents',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: false,
    supportsScan: true,
  },
  {
    provider: 'milvus',
    create: () =>
      new MilvusClientWrapper({
        address: 'localhost:19530',
        collectionName: 'documents',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: false,
    supportsScan: true,
  },
  {
    provider: 'elasticsearch',
    create: () =>
      new ElasticsearchClientWrapper({
        node: 'http://localhost:9200',
        indexName: 'documents',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: true,
    supportsScan: true,
  },
  {
    provider: 'opensearch',
    create: () =>
      new OpenSearchClientWrapper({
        node: 'http://localhost:9200',
        indexName: 'documents',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: true,
    supportsScan: true,
  },
  {
    provider: 'redis',
    create: () =>
      new RedisVectorClientWrapper({
        url: 'redis://localhost:6379',
        indexName: 'documents',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: true,
    supportsScan: true,
  },
  {
    provider: 'mongodb',
    create: () =>
      new MongoDBVectorClientWrapper({
        connectionString: 'mongodb://localhost:27017',
        databaseName: 'rag',
        collectionName: 'documents',
        vectorIndexName: 'vector_index',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: false,
    supportsScan: true,
  },
  {
    provider: 'azure-ai-search',
    create: () =>
      new AzureAISearchClientWrapper({
        endpoint: 'https://example.search.windows.net',
        apiKey: 'azure-key',
        indexName: 'documents',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: true,
    supportsScan: true,
  },
  {
    provider: 'lancedb',
    create: () =>
      new LanceDBClientWrapper({
        uri: '.lancedb-data',
        tableName: 'documents',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: false,
    supportsScan: true,
  },
  {
    provider: 'vespa',
    create: () =>
      new VespaClientWrapper({
        endpoint: 'http://localhost:8080',
        namespace: 'rag',
        documentType: 'document',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: true,
    supportsScan: true,
  },
  {
    provider: 'supabase',
    create: () =>
      new SupabaseVectorClientWrapper({
        url: 'https://project.supabase.co',
        serviceRoleKey: 'service-role-key',
        tableName: 'documents',
        vectorDimension: 1536,
      }),
    supportsHybridSearch: false,
    supportsScan: true,
  },
  {
    provider: 'sandbox',
    create: () => new SandboxVectorStore({ collectionName: 'documents' }),
    supportsHybridSearch: false,
    supportsScan: true,
  },
];

describe('VectorStoreAdapter contract', () => {
  it.each(contractCases)('$provider implements required adapter surface', (contractCase) => {
    const adapter = contractCase.create();
    expectAdapterContract(adapter, contractCase.provider);
  });

  it.each(
    contractCases,
  )('$provider reports expected hybrid and scan capabilities', (contractCase) => {
    const adapter = contractCase.create();
    expect(adapter.capabilities.supportsHybridSearch).toBe(contractCase.supportsHybridSearch);
    expect(adapter.capabilities.supportsScan).toBe(contractCase.supportsScan);
    expect(typeof adapter.scanPoints === 'function').toBe(contractCase.supportsScan);
  });
});

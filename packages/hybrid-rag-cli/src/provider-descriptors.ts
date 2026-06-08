import type { VectorStoreProvider } from '@reaatech/hybrid-rag';

/**
 * Static provider descriptor table for `hybrid-rag providers inspect`.
 *
 * Capability flags and cost models mirror the values declared by the
 * corresponding vector-store adapters (and the MCP `rag.list_providers` /
 * `rag.detect_capabilities` tools). Required config fields and supported env
 * vars mirror the CLI's `buildVectorStoreConfig` resolution.
 *
 * `envVars` lists the canonical HYBRID_RAG_* names together with the legacy
 * unprefixed names that are honored for backward compatibility (prefixed wins).
 */

export interface ProviderCapabilities {
  supportsHybridSearch: boolean;
  supportsMetadataFiltering: boolean;
  supportsBatchUpsert: boolean;
  supportsCollectionManagement: boolean;
  supportsMultiTenancy: boolean;
  supportsQuantization: boolean;
  supportsScan: boolean;
  maxBatchSize: number;
  maxVectorDimension: number;
}

export interface ProviderCostModel {
  costPerQueryEstimate: number;
  costPer1000Upserts: number;
  monthlyBaseCost?: number;
}

export interface ProviderEnvVar {
  /** Canonical HYBRID_RAG_* env var name. */
  name: string;
  /** Legacy unprefixed name honored for backward compatibility, if any. */
  legacy?: string;
  /** Whether this config value is required (no usable default). */
  required: boolean;
  /** Whether the value is a secret and must be redacted in diagnostics. */
  secret?: boolean;
  description: string;
}

export interface ProviderDescriptor {
  name: VectorStoreProvider;
  description: string;
  /** True when the provider can run locally for development. */
  localDev: boolean;
  /** Setup notes for running the provider locally (or why it cannot). */
  localSetup: string;
  /** Required config fields (passed to the adapter constructor). */
  requiredFields: string[];
  envVars: ProviderEnvVar[];
  capabilities: ProviderCapabilities;
  costModel: ProviderCostModel;
  /** Whether the migration tooling can scan/export from this provider. */
  migrationScanSupport: boolean;
  knownLimitations: string[];
}

const VECTOR_DIMENSION_ENV: ProviderEnvVar = {
  name: 'HYBRID_RAG_VECTOR_DIMENSION',
  required: false,
  description: 'Vector dimension (default: 1536)',
};

const COLLECTION_ENV: ProviderEnvVar = {
  name: 'HYBRID_RAG_COLLECTION',
  required: false,
  description: 'Collection name (default: documents)',
};

export const PROVIDER_DESCRIPTORS: Record<VectorStoreProvider, ProviderDescriptor> = {
  qdrant: {
    name: 'qdrant',
    description: 'Qdrant vector database',
    localDev: true,
    localSetup: 'docker run -p 6333:6333 qdrant/qdrant',
    requiredFields: ['url', 'collectionName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_QDRANT_URL',
        legacy: 'QDRANT_URL',
        required: false,
        description: 'Qdrant server URL (default: http://localhost:6333)',
      },
      {
        name: 'HYBRID_RAG_QDRANT_API_KEY',
        legacy: 'QDRANT_API_KEY',
        required: false,
        secret: true,
        description: 'Qdrant API key (cloud)',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: false,
      supportsQuantization: false,
      supportsScan: true,
      maxBatchSize: 100,
      maxVectorDimension: 65535,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['No native hybrid search; BM25 fusion is applied client-side.'],
  },
  pinecone: {
    name: 'pinecone',
    description: 'Pinecone managed vector database',
    localDev: false,
    localSetup: 'Cloud only; create an index at https://app.pinecone.io.',
    requiredFields: ['apiKey', 'indexName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_PINECONE_API_KEY',
        legacy: 'PINECONE_API_KEY',
        required: true,
        secret: true,
        description: 'Pinecone API key',
      },
      {
        name: 'HYBRID_RAG_PINECONE_INDEX',
        legacy: 'PINECONE_INDEX',
        required: false,
        description: 'Pinecone index name (default: collection name)',
      },
      {
        name: 'HYBRID_RAG_PINECONE_CLOUD',
        legacy: 'PINECONE_CLOUD',
        required: false,
        description: 'Serverless cloud provider (e.g. aws)',
      },
      {
        name: 'HYBRID_RAG_PINECONE_REGION',
        legacy: 'PINECONE_REGION',
        required: false,
        description: 'Serverless region (e.g. us-east-1)',
      },
      {
        name: 'HYBRID_RAG_PINECONE_NAMESPACE',
        legacy: 'PINECONE_NAMESPACE',
        required: false,
        description: 'Namespace',
      },
    ],
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
    costModel: { costPerQueryEstimate: 0.00001, costPer1000Upserts: 0.01, monthlyBaseCost: 70 },
    migrationScanSupport: false,
    knownLimitations: [
      'No scan/export API; cannot be used as a migration source.',
      'No collection management; indexes are provisioned out-of-band.',
    ],
  },
  weaviate: {
    name: 'weaviate',
    description: 'Weaviate vector database',
    localDev: true,
    localSetup: 'docker run -p 8080:8080 semitechnologies/weaviate',
    requiredFields: ['url', 'className'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_WEAVIATE_URL',
        legacy: 'WEAVIATE_URL',
        required: true,
        description: 'Weaviate URL (e.g. http://localhost:8080)',
      },
      {
        name: 'HYBRID_RAG_WEAVIATE_API_KEY',
        legacy: 'WEAVIATE_API_KEY',
        required: false,
        secret: true,
        description: 'Weaviate API key',
      },
      {
        name: 'HYBRID_RAG_WEAVIATE_CLASS',
        legacy: 'WEAVIATE_CLASS',
        required: false,
        description: 'Class name (default: collection name)',
      },
      {
        name: 'HYBRID_RAG_WEAVIATE_TENANT',
        legacy: 'WEAVIATE_TENANT',
        required: false,
        description: 'Tenant name (multi-tenancy)',
      },
    ],
    capabilities: {
      supportsHybridSearch: true,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: true,
      supportsQuantization: false,
      supportsScan: true,
      maxBatchSize: 100,
      maxVectorDimension: 65535,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['Class names must start with an uppercase letter.'],
  },
  chroma: {
    name: 'chroma',
    description: 'Chroma vector database (server required)',
    localDev: true,
    localSetup: 'docker run -p 8000:8000 chromadb/chroma  (or: chroma run)',
    requiredFields: ['collectionName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_CHROMA_URL',
        legacy: 'CHROMA_URL',
        required: false,
        description: 'Chroma server URL (default: http://localhost:8000)',
      },
      {
        name: 'HYBRID_RAG_CHROMA_TENANT',
        legacy: 'CHROMA_TENANT',
        required: false,
        description: 'Tenant name',
      },
    ],
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: true,
      supportsQuantization: false,
      supportsScan: true,
      maxBatchSize: 5461,
      maxVectorDimension: 20000,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: [
      'Requires a running Chroma server (no embedded mode).',
      'No native hybrid search; BM25 fusion is applied client-side.',
    ],
  },
  pgvector: {
    name: 'pgvector',
    description: 'PostgreSQL pgvector extension',
    localDev: true,
    localSetup: 'docker run -p 5432:5432 pgvector/pgvector:pg16  (CREATE EXTENSION vector)',
    requiredFields: ['connectionString', 'tableName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_PGVECTOR_CONNECTION_STRING',
        legacy: 'PGVECTOR_CONNECTION_STRING',
        required: true,
        secret: true,
        description: 'Postgres connection string (postgres://...)',
      },
      {
        name: 'HYBRID_RAG_PGVECTOR_TABLE',
        legacy: 'PGVECTOR_TABLE',
        required: false,
        description: 'Table name (default: collection name)',
      },
      {
        name: 'HYBRID_RAG_PGVECTOR_SCHEMA',
        legacy: 'PGVECTOR_SCHEMA',
        required: false,
        description: 'Schema name (default: public)',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: true,
      supportsQuantization: false,
      supportsScan: true,
      maxBatchSize: 1000,
      maxVectorDimension: 16000,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: [
      'The pgvector extension must be installed in the target database.',
      'No native hybrid search; BM25 fusion is applied client-side.',
    ],
  },
  milvus: {
    name: 'milvus',
    description: 'Milvus/Zilliz vector database',
    localDev: true,
    localSetup: 'docker compose up (Milvus standalone) or use Zilliz Cloud.',
    requiredFields: ['address', 'collectionName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_MILVUS_ADDRESS',
        legacy: 'MILVUS_ADDRESS',
        required: false,
        description: 'Milvus address (default: localhost:19530)',
      },
      {
        name: 'HYBRID_RAG_MILVUS_TOKEN',
        legacy: 'MILVUS_TOKEN',
        required: false,
        secret: true,
        description: 'Milvus/Zilliz auth token',
      },
      {
        name: 'HYBRID_RAG_MILVUS_DATABASE',
        legacy: 'MILVUS_DATABASE',
        required: false,
        description: 'Database name',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: true,
      supportsQuantization: true,
      supportsScan: true,
      maxBatchSize: 1000,
      maxVectorDimension: 32768,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['No native hybrid search; BM25 fusion is applied client-side.'],
  },
  elasticsearch: {
    name: 'elasticsearch',
    description: 'Elasticsearch with vector search',
    localDev: true,
    localSetup: 'docker run -p 9200:9200 elasticsearch:8',
    requiredFields: ['node', 'indexName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_ELASTICSEARCH_NODE',
        legacy: 'ELASTICSEARCH_NODE',
        required: true,
        description: 'Elasticsearch node URL',
      },
      {
        name: 'HYBRID_RAG_ELASTICSEARCH_API_KEY',
        legacy: 'ELASTICSEARCH_API_KEY',
        required: false,
        secret: true,
        description: 'API key',
      },
      {
        name: 'HYBRID_RAG_ELASTICSEARCH_USERNAME',
        legacy: 'ELASTICSEARCH_USERNAME',
        required: false,
        description: 'Basic auth username',
      },
      {
        name: 'HYBRID_RAG_ELASTICSEARCH_PASSWORD',
        legacy: 'ELASTICSEARCH_PASSWORD',
        required: false,
        secret: true,
        description: 'Basic auth password',
      },
      {
        name: 'HYBRID_RAG_ELASTICSEARCH_INDEX',
        legacy: 'ELASTICSEARCH_INDEX',
        required: false,
        description: 'Index name (default: collection name)',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: true,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: false,
      supportsQuantization: true,
      supportsScan: true,
      maxBatchSize: 500,
      maxVectorDimension: 4096,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['Max vector dimension is 4096.'],
  },
  opensearch: {
    name: 'opensearch',
    description: 'OpenSearch with k-NN',
    localDev: true,
    localSetup: 'docker run -p 9200:9200 opensearchproject/opensearch:2',
    requiredFields: ['node', 'indexName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_OPENSEARCH_NODE',
        legacy: 'OPENSEARCH_NODE',
        required: true,
        description: 'OpenSearch node URL',
      },
      {
        name: 'HYBRID_RAG_OPENSEARCH_API_KEY',
        legacy: 'OPENSEARCH_API_KEY',
        required: false,
        secret: true,
        description: 'API key',
      },
      {
        name: 'HYBRID_RAG_OPENSEARCH_USERNAME',
        legacy: 'OPENSEARCH_USERNAME',
        required: false,
        description: 'Basic auth username',
      },
      {
        name: 'HYBRID_RAG_OPENSEARCH_PASSWORD',
        legacy: 'OPENSEARCH_PASSWORD',
        required: false,
        secret: true,
        description: 'Basic auth password',
      },
      {
        name: 'HYBRID_RAG_OPENSEARCH_INDEX',
        legacy: 'OPENSEARCH_INDEX',
        required: false,
        description: 'Index name (default: collection name)',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: true,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: false,
      supportsQuantization: true,
      supportsScan: true,
      maxBatchSize: 500,
      maxVectorDimension: 16000,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['k-NN plugin must be enabled on the cluster.'],
  },
  redis: {
    name: 'redis',
    description: 'Redis Vector Search',
    localDev: true,
    localSetup: 'docker run -p 6379:6379 redis/redis-stack-server',
    requiredFields: ['url', 'indexName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_REDIS_URL',
        legacy: 'REDIS_URL',
        required: true,
        description: 'Redis URL (redis://...)',
      },
      {
        name: 'HYBRID_RAG_REDIS_INDEX',
        legacy: 'REDIS_INDEX',
        required: false,
        description: 'Index name (default: collection name)',
      },
      {
        name: 'HYBRID_RAG_REDIS_KEY_PREFIX',
        legacy: 'REDIS_KEY_PREFIX',
        required: false,
        description: 'Key prefix',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: true,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: true,
      supportsQuantization: false,
      supportsScan: true,
      maxBatchSize: 1000,
      maxVectorDimension: 32768,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['Requires the RediSearch module (Redis Stack).'],
  },
  mongodb: {
    name: 'mongodb',
    description: 'MongoDB Atlas Vector Search',
    localDev: false,
    localSetup: 'Atlas only; Vector Search is not available on local mongod.',
    requiredFields: ['connectionString', 'databaseName', 'collectionName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_MONGODB_CONNECTION_STRING',
        legacy: 'MONGODB_CONNECTION_STRING',
        required: true,
        secret: true,
        description: 'MongoDB connection string (mongodb+srv://...)',
      },
      {
        name: 'HYBRID_RAG_MONGODB_DATABASE',
        legacy: 'MONGODB_DATABASE',
        required: true,
        description: 'Database name',
      },
      {
        name: 'HYBRID_RAG_MONGODB_VECTOR_INDEX',
        legacy: 'MONGODB_VECTOR_INDEX',
        required: false,
        description: 'Vector index name (default: vector_index)',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: true,
      supportsQuantization: true,
      supportsScan: true,
      maxBatchSize: 1000,
      maxVectorDimension: 4096,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: [
      'Requires MongoDB Atlas (Vector Search is unavailable on self-hosted).',
      'No native hybrid search; BM25 fusion is applied client-side.',
    ],
  },
  'azure-ai-search': {
    name: 'azure-ai-search',
    description: 'Azure AI Search',
    localDev: false,
    localSetup: 'Cloud only; provision an Azure AI Search service.',
    requiredFields: ['endpoint', 'apiKey', 'indexName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_AZURE_AI_SEARCH_ENDPOINT',
        legacy: 'AZURE_AI_SEARCH_ENDPOINT',
        required: true,
        description: 'Azure AI Search endpoint URL',
      },
      {
        name: 'HYBRID_RAG_AZURE_AI_SEARCH_API_KEY',
        legacy: 'AZURE_AI_SEARCH_API_KEY',
        required: true,
        secret: true,
        description: 'Azure AI Search admin/query key',
      },
      {
        name: 'HYBRID_RAG_AZURE_AI_SEARCH_INDEX',
        legacy: 'AZURE_AI_SEARCH_INDEX',
        required: false,
        description: 'Index name (default: collection name)',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: true,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: false,
      supportsQuantization: true,
      supportsScan: true,
      maxBatchSize: 1000,
      maxVectorDimension: 4096,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['Max vector dimension is 4096.'],
  },
  lancedb: {
    name: 'lancedb',
    description: 'LanceDB (embedded, zero-config default)',
    localDev: true,
    localSetup: 'Embedded; no server required. Data is stored at the configured URI.',
    requiredFields: ['uri', 'tableName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_LANCEDB_URI',
        legacy: 'LANCEDB_URI',
        required: false,
        description: 'LanceDB data directory URI (default: ./.lancedb)',
      },
      {
        name: 'HYBRID_RAG_LANCEDB_TABLE',
        legacy: 'LANCEDB_TABLE',
        required: false,
        description: 'Table name (default: collection name)',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: true,
      supportsMultiTenancy: false,
      supportsQuantization: true,
      supportsScan: true,
      maxBatchSize: 1000,
      maxVectorDimension: 32768,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['No native hybrid search; BM25 fusion is applied client-side.'],
  },
  vespa: {
    name: 'vespa',
    description: 'Vespa.ai',
    localDev: true,
    localSetup: 'docker run -p 8080:8080 vespaengine/vespa  (deploy an application package)',
    requiredFields: ['endpoint', 'documentType'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_VESPA_ENDPOINT',
        legacy: 'VESPA_ENDPOINT',
        required: true,
        description: 'Vespa endpoint URL',
      },
      {
        name: 'HYBRID_RAG_VESPA_NAMESPACE',
        legacy: 'VESPA_NAMESPACE',
        required: false,
        description: 'Namespace (default: default)',
      },
      {
        name: 'HYBRID_RAG_VESPA_DOCUMENT_TYPE',
        legacy: 'VESPA_DOCUMENT_TYPE',
        required: false,
        description: 'Document type (default: collection name)',
      },
      {
        name: 'HYBRID_RAG_VESPA_API_KEY',
        legacy: 'VESPA_API_KEY',
        required: false,
        secret: true,
        description: 'Vespa Cloud API key',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: true,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: false,
      supportsMultiTenancy: true,
      supportsQuantization: true,
      supportsScan: true,
      maxBatchSize: 500,
      maxVectorDimension: 32768,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: ['Requires a deployed application package defining the schema.'],
  },
  supabase: {
    name: 'supabase',
    description: 'Supabase Vector (pgvector-backed)',
    localDev: false,
    localSetup: 'Use a Supabase project (or `supabase start` for a local stack).',
    requiredFields: ['url', 'serviceRoleKey', 'tableName'],
    envVars: [
      COLLECTION_ENV,
      {
        name: 'HYBRID_RAG_SUPABASE_URL',
        legacy: 'SUPABASE_URL',
        required: true,
        description: 'Supabase project URL',
      },
      {
        name: 'HYBRID_RAG_SUPABASE_SERVICE_ROLE_KEY',
        legacy: 'SUPABASE_SERVICE_ROLE_KEY',
        required: true,
        secret: true,
        description: 'Supabase service role key',
      },
      {
        name: 'HYBRID_RAG_SUPABASE_TABLE',
        legacy: 'SUPABASE_TABLE',
        required: false,
        description: 'Table name (default: collection name)',
      },
      {
        name: 'HYBRID_RAG_SUPABASE_SCHEMA',
        legacy: 'SUPABASE_SCHEMA',
        required: false,
        description: 'Schema name (default: public)',
      },
      VECTOR_DIMENSION_ENV,
    ],
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsCollectionManagement: false,
      supportsMultiTenancy: true,
      supportsQuantization: false,
      supportsScan: true,
      maxBatchSize: 500,
      maxVectorDimension: 16000,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0 },
    migrationScanSupport: true,
    knownLimitations: [
      'Requires the pgvector extension enabled in the Supabase project.',
      'No native hybrid search; BM25 fusion is applied client-side.',
    ],
  },
  sandbox: {
    name: 'sandbox',
    description: 'In-memory sandbox for testing',
    localDev: true,
    localSetup: 'In-memory; no setup required. Data is not persisted.',
    requiredFields: ['collectionName'],
    envVars: [COLLECTION_ENV],
    capabilities: {
      supportsHybridSearch: false,
      supportsMetadataFiltering: false,
      supportsBatchUpsert: true,
      supportsCollectionManagement: false,
      supportsMultiTenancy: false,
      supportsQuantization: false,
      supportsScan: true,
      maxBatchSize: 1000,
      maxVectorDimension: 10000,
    },
    costModel: { costPerQueryEstimate: 0, costPer1000Upserts: 0, monthlyBaseCost: 0 },
    migrationScanSupport: true,
    knownLimitations: [
      'Data is held in memory only and lost on process exit.',
      'No metadata filtering.',
    ],
  },
};

export function getProviderDescriptor(name: string): ProviderDescriptor | undefined {
  return PROVIDER_DESCRIPTORS[name as VectorStoreProvider];
}

export function listProviderNames(): VectorStoreProvider[] {
  return Object.keys(PROVIDER_DESCRIPTORS) as VectorStoreProvider[];
}

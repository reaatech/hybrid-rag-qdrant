import { writeFile } from 'node:fs/promises';
import type { VectorStoreConfig, VectorStoreProvider } from '@reaatech/hybrid-rag';
import { validateVectorStoreConfig } from '@reaatech/hybrid-rag';

export interface MigrateOptions {
  from: string;
  fromProvider: string;
  to: string;
  toProvider: string;
  batchSize: number | string;
  dryRun: boolean;
  continueOnError: boolean;
  plan: string;
}

function requiredEnv(name: string, provider: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Provider '${provider}' requires ${name} or a full JSON config`);
  }
  return value;
}

function shorthandConfig(provider: VectorStoreProvider): VectorStoreConfig {
  const vectorDimension = Number.parseInt(process.env.HYBRID_RAG_VECTOR_DIMENSION ?? '1536', 10);
  const collectionName = process.env.HYBRID_RAG_COLLECTION ?? 'documents';

  switch (provider) {
    case 'qdrant':
      return validateVectorStoreConfig({
        provider,
        url: process.env.QDRANT_URL ?? 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY,
        collectionName,
        vectorSize: vectorDimension,
      });
    case 'lancedb':
      return validateVectorStoreConfig({
        provider,
        uri: process.env.LANCEDB_URI ?? './.lancedb',
        tableName: process.env.LANCEDB_TABLE ?? collectionName,
        vectorDimension,
      });
    case 'sandbox':
      return validateVectorStoreConfig({ provider, collectionName });
    case 'chroma':
      return validateVectorStoreConfig({
        provider,
        url: process.env.CHROMA_URL,
        collectionName,
      });
    case 'pinecone':
      return validateVectorStoreConfig({
        provider,
        apiKey: requiredEnv('PINECONE_API_KEY', provider),
        indexName: process.env.PINECONE_INDEX ?? collectionName,
        namespace: process.env.PINECONE_NAMESPACE,
      });
    case 'weaviate':
      return validateVectorStoreConfig({
        provider,
        url: requiredEnv('WEAVIATE_URL', provider),
        apiKey: process.env.WEAVIATE_API_KEY,
        className: process.env.WEAVIATE_CLASS ?? collectionName,
      });
    case 'pgvector':
      return validateVectorStoreConfig({
        provider,
        connectionString: requiredEnv('PGVECTOR_CONNECTION_STRING', provider),
        tableName: process.env.PGVECTOR_TABLE ?? collectionName,
        vectorDimension,
      });
    case 'milvus':
      return validateVectorStoreConfig({
        provider,
        address: process.env.MILVUS_ADDRESS ?? 'localhost:19530',
        token: process.env.MILVUS_TOKEN,
        collectionName,
        vectorDimension,
      });
    case 'elasticsearch':
      return validateVectorStoreConfig({
        provider,
        node: requiredEnv('ELASTICSEARCH_NODE', provider),
        apiKey: process.env.ELASTICSEARCH_API_KEY,
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD,
        indexName: process.env.ELASTICSEARCH_INDEX ?? collectionName,
        vectorDimension,
      });
    case 'opensearch':
      return validateVectorStoreConfig({
        provider,
        node: requiredEnv('OPENSEARCH_NODE', provider),
        apiKey: process.env.OPENSEARCH_API_KEY,
        username: process.env.OPENSEARCH_USERNAME,
        password: process.env.OPENSEARCH_PASSWORD,
        indexName: process.env.OPENSEARCH_INDEX ?? collectionName,
        vectorDimension,
      });
    case 'redis':
      return validateVectorStoreConfig({
        provider,
        url: requiredEnv('REDIS_URL', provider),
        indexName: process.env.REDIS_INDEX ?? collectionName,
        vectorDimension,
      });
    case 'mongodb':
      return validateVectorStoreConfig({
        provider,
        connectionString: requiredEnv('MONGODB_CONNECTION_STRING', provider),
        databaseName: requiredEnv('MONGODB_DATABASE', provider),
        collectionName,
        vectorIndexName: process.env.MONGODB_VECTOR_INDEX ?? 'vector_index',
        vectorDimension,
      });
    case 'azure-ai-search':
      return validateVectorStoreConfig({
        provider,
        endpoint: requiredEnv('AZURE_AI_SEARCH_ENDPOINT', provider),
        apiKey: requiredEnv('AZURE_AI_SEARCH_API_KEY', provider),
        indexName: process.env.AZURE_AI_SEARCH_INDEX ?? collectionName,
        vectorDimension,
      });
    case 'vespa':
      return validateVectorStoreConfig({
        provider,
        endpoint: requiredEnv('VESPA_ENDPOINT', provider),
        namespace: process.env.VESPA_NAMESPACE ?? 'default',
        documentType: process.env.VESPA_DOCUMENT_TYPE ?? collectionName,
        vectorDimension,
        apiKey: process.env.VESPA_API_KEY,
      });
    case 'supabase':
      return validateVectorStoreConfig({
        provider,
        url: requiredEnv('SUPABASE_URL', provider),
        serviceRoleKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY', provider),
        tableName: process.env.SUPABASE_TABLE ?? collectionName,
        vectorDimension,
      });
  }
}

function parseConfig(
  raw: string | undefined,
  provider: string | undefined,
  label: string,
): VectorStoreConfig {
  if (raw?.trim().startsWith('{')) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return validateVectorStoreConfig(parsed);
  }
  if (provider) {
    return shorthandConfig(provider as VectorStoreProvider);
  }
  throw new Error(`Specify --${label} <JSON> or --${label}-provider <name>`);
}

export async function migrateCommand(options: MigrateOptions): Promise<void> {
  const sourceConfig = parseConfig(options.from, options.fromProvider, 'from');
  const targetConfig = parseConfig(options.to, options.toProvider, 'to');
  const batchSize = Number.parseInt(String(options.batchSize ?? 100), 10);

  const planData = {
    source: sourceConfig,
    target: targetConfig,
    batchSize,
    dryRun: options.dryRun || false,
    continueOnError: options.continueOnError || false,
  };

  if (options.plan) {
    await writeFile(options.plan, JSON.stringify(planData, null, 2));
    console.log(`Migration plan written to: ${options.plan}`);
    return;
  }

  if (options.dryRun) {
    console.log('Dry-run mode. No vectors migrated.');
    console.log(`  Source: ${sourceConfig.provider}`);
    console.log(`  Target: ${targetConfig.provider}`);
    return;
  }

  console.log(`Migrating from ${sourceConfig.provider} to ${targetConfig.provider}...`);

  const { migrateVectors } = await import('@reaatech/hybrid-rag-migration');
  const result = await migrateVectors(sourceConfig, targetConfig, {
    batchSize,
    continueOnError: options.continueOnError || false,
  });

  console.log(`Migrated ${result.pointsMigrated} points in ${result.durationMs}ms`);
  if (result.errors.length > 0) {
    console.error(`Errors: ${result.errors.length}`);
  }
}

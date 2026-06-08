import type { VectorStoreAdapter, VectorStoreConfig } from '@reaatech/hybrid-rag';
import { VectorStoreOperationError } from '@reaatech/hybrid-rag';
import { createFromRegistry, hasProvider } from './vector-store-registry.js';

export async function createVectorStore(config: VectorStoreConfig): Promise<VectorStoreAdapter> {
  if (hasProvider(config.provider)) {
    return createFromRegistry(config);
  }

  switch (config.provider) {
    case 'qdrant': {
      try {
        const { QdrantClientWrapper } = await import('@reaatech/hybrid-rag-qdrant');
        return new QdrantClientWrapper({
          url: config.url,
          apiKey: config.apiKey,
          collectionName: config.collectionName,
          vectorSize: config.vectorSize,
          distance: config.distance,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'qdrant' selected but '@reaatech/hybrid-rag-qdrant' is not installed. Run: pnpm add @reaatech/hybrid-rag-qdrant`,
            'qdrant',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'pinecone': {
      try {
        const { PineconeClientWrapper } = await import('@reaatech/hybrid-rag-pinecone');
        return new PineconeClientWrapper({
          apiKey: config.apiKey,
          indexName: config.indexName,
          cloud: config.cloud,
          region: config.region,
          namespace: config.namespace,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'pinecone' selected but '@reaatech/hybrid-rag-pinecone' is not installed. Run: pnpm add @reaatech/hybrid-rag-pinecone`,
            'pinecone',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'weaviate': {
      try {
        const { WeaviateClientWrapper } = await import('@reaatech/hybrid-rag-weaviate');
        return new WeaviateClientWrapper({
          url: config.url,
          apiKey: config.apiKey,
          className: config.className,
          tenant: config.tenant,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'weaviate' selected but '@reaatech/hybrid-rag-weaviate' is not installed. Run: pnpm add @reaatech/hybrid-rag-weaviate`,
            'weaviate',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'chroma': {
      try {
        const { ChromaClientWrapper } = await import('@reaatech/hybrid-rag-chroma');
        return new ChromaClientWrapper({
          url: config.url,
          collectionName: config.collectionName,
          tenant: config.tenant,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'chroma' selected but '@reaatech/hybrid-rag-chroma' is not installed. Run: pnpm add @reaatech/hybrid-rag-chroma`,
            'chroma',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'pgvector': {
      try {
        const { PgVectorClientWrapper } = await import('@reaatech/hybrid-rag-pgvector');
        return new PgVectorClientWrapper({
          connectionString: config.connectionString,
          tableName: config.tableName,
          vectorDimension: config.vectorDimension,
          schema: config.schema,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'pgvector' selected but '@reaatech/hybrid-rag-pgvector' is not installed. Run: pnpm add @reaatech/hybrid-rag-pgvector`,
            'pgvector',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'milvus': {
      try {
        const { MilvusClientWrapper } = await import('@reaatech/hybrid-rag-milvus');
        return new MilvusClientWrapper({
          address: config.address,
          token: config.token,
          collectionName: config.collectionName,
          vectorDimension: config.vectorDimension,
          database: config.database,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'milvus' selected but '@reaatech/hybrid-rag-milvus' is not installed. Run: pnpm add @reaatech/hybrid-rag-milvus`,
            'milvus',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'elasticsearch': {
      try {
        const { ElasticsearchClientWrapper } = await import('@reaatech/hybrid-rag-elasticsearch');
        return new ElasticsearchClientWrapper({
          node: config.node,
          apiKey: config.apiKey,
          username: config.username,
          password: config.password,
          indexName: config.indexName,
          vectorDimension: config.vectorDimension,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'elasticsearch' selected but '@reaatech/hybrid-rag-elasticsearch' is not installed. Run: pnpm add @reaatech/hybrid-rag-elasticsearch`,
            'elasticsearch',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'opensearch': {
      try {
        const { OpenSearchClientWrapper } = await import('@reaatech/hybrid-rag-opensearch');
        return new OpenSearchClientWrapper({
          node: config.node,
          apiKey: config.apiKey,
          username: config.username,
          password: config.password,
          indexName: config.indexName,
          vectorDimension: config.vectorDimension,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'opensearch' selected but '@reaatech/hybrid-rag-opensearch' is not installed. Run: pnpm add @reaatech/hybrid-rag-opensearch`,
            'opensearch',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'redis': {
      try {
        const { RedisVectorClientWrapper } = await import('@reaatech/hybrid-rag-redis');
        return new RedisVectorClientWrapper({
          url: config.url,
          indexName: config.indexName,
          vectorDimension: config.vectorDimension,
          keyPrefix: config.keyPrefix,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'redis' selected but '@reaatech/hybrid-rag-redis' is not installed. Run: pnpm add @reaatech/hybrid-rag-redis`,
            'redis',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'mongodb': {
      try {
        const { MongoDBVectorClientWrapper } = await import('@reaatech/hybrid-rag-mongodb');
        return new MongoDBVectorClientWrapper({
          connectionString: config.connectionString,
          databaseName: config.databaseName,
          collectionName: config.collectionName,
          vectorIndexName: config.vectorIndexName,
          vectorDimension: config.vectorDimension,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'mongodb' selected but '@reaatech/hybrid-rag-mongodb' is not installed. Run: pnpm add @reaatech/hybrid-rag-mongodb`,
            'mongodb',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'azure-ai-search': {
      try {
        const { AzureAISearchClientWrapper } = await import('@reaatech/hybrid-rag-azure-ai-search');
        return new AzureAISearchClientWrapper({
          endpoint: config.endpoint,
          apiKey: config.apiKey,
          indexName: config.indexName,
          vectorDimension: config.vectorDimension,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'azure-ai-search' selected but '@reaatech/hybrid-rag-azure-ai-search' is not installed. Run: pnpm add @reaatech/hybrid-rag-azure-ai-search`,
            'azure-ai-search',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'lancedb': {
      try {
        const { LanceDBClientWrapper } = await import('@reaatech/hybrid-rag-lancedb');
        return new LanceDBClientWrapper({
          uri: config.uri,
          tableName: config.tableName,
          vectorDimension: config.vectorDimension,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'lancedb' selected but '@reaatech/hybrid-rag-lancedb' is not installed. Run: pnpm add @reaatech/hybrid-rag-lancedb`,
            'lancedb',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'vespa': {
      try {
        const { VespaClientWrapper } = await import('@reaatech/hybrid-rag-vespa');
        return new VespaClientWrapper({
          endpoint: config.endpoint,
          namespace: config.namespace,
          documentType: config.documentType,
          vectorDimension: config.vectorDimension,
          apiKey: config.apiKey,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'vespa' selected but '@reaatech/hybrid-rag-vespa' is not installed. Run: pnpm add @reaatech/hybrid-rag-vespa`,
            'vespa',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'supabase': {
      try {
        const { SupabaseVectorClientWrapper } = await import('@reaatech/hybrid-rag-supabase');
        return new SupabaseVectorClientWrapper({
          url: config.url,
          serviceRoleKey: config.serviceRoleKey,
          tableName: config.tableName,
          vectorDimension: config.vectorDimension,
          schema: config.schema,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
          throw new VectorStoreOperationError(
            `Provider 'supabase' selected but '@reaatech/hybrid-rag-supabase' is not installed. Run: pnpm add @reaatech/hybrid-rag-supabase`,
            'supabase',
            'initialize',
          );
        }
        throw err;
      }
    }
    case 'sandbox': {
      const { SandboxVectorStore } = await import('./sandbox-store.js');
      return new SandboxVectorStore(config);
    }
    default:
      throw new Error(`Unknown vector store provider: ${(config as VectorStoreConfig).provider}`);
  }
}

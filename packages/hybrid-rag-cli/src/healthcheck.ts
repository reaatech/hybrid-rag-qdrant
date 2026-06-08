import type { VectorStoreConfig } from '@reaatech/hybrid-rag';
import { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

function buildVectorStoreConfig(): VectorStoreConfig | undefined {
  const provider = (process.env.VECTOR_STORE_PROVIDER ||
    (process.env.QDRANT_URL ? 'qdrant' : '')) as string;
  const storeUrl = process.env.VECTOR_STORE_URL || process.env.QDRANT_URL;
  const apiKey = process.env.VECTOR_STORE_API_KEY;
  const collectionName = process.env.COLLECTION_NAME || 'documents';
  const vectorSize = Number(process.env.VECTOR_DIMENSION) || 1536;

  switch (provider) {
    case 'qdrant':
      return {
        provider,
        url: storeUrl || 'http://localhost:6333',
        apiKey,
        collectionName,
        vectorSize,
      };
    case 'pinecone':
      return { provider, apiKey: apiKey || '', indexName: collectionName };
    case 'weaviate':
      return {
        provider,
        url: storeUrl || 'http://localhost:8080',
        apiKey,
        className: collectionName,
      };
    case 'chroma':
      return { provider, url: storeUrl, collectionName };
    case 'pgvector':
      return {
        provider,
        connectionString: storeUrl || '',
        tableName: collectionName,
        vectorDimension: vectorSize,
      };
    case 'lancedb':
      return {
        provider,
        uri: storeUrl || '.lancedb-data',
        tableName: collectionName,
        vectorDimension: vectorSize,
      };
    case 'sandbox':
      return { provider, collectionName };
    default:
      return undefined;
  }
}

async function healthCheck(): Promise<void> {
  try {
    const pipeline = new RAGPipeline({
      vectorStore: buildVectorStoreConfig(),
    });

    await pipeline.initialize();
    const stats = await pipeline.getStats();

    if (stats.collectionName) {
      process.stdout.write('Health check passed\n');
      process.exit(0);
    } else {
      process.stderr.write('Health check failed: no collection\n');
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`Health check failed: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

healthCheck();

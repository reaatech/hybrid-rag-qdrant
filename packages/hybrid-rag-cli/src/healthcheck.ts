/**
 * Health check endpoint for container orchestration
 */

import { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

async function healthCheck(): Promise<void> {
  try {
    const pipeline = new RAGPipeline({
      qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      collectionName: process.env.COLLECTION_NAME || 'documents',
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

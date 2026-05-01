/**
 * Query Command
 */

import type { QueryOptions, RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

export interface QueryCommandOptions {
  topK: number;
  rerank: boolean;
  vectorWeight: number;
  bm25Weight: number;
  qdrantUrl: string;
  collection: string;
}

export async function queryCommand(
  query: string,
  options: QueryCommandOptions,
  pipeline: RAGPipeline,
): Promise<void> {
  console.log(`Querying: "${query}"`);

  const queryOptions: QueryOptions = {
    topK: options.topK,
    useReranker: options.rerank,
    vectorWeight: options.vectorWeight,
    bm25Weight: options.bm25Weight,
  };

  const results = await pipeline.query(query, queryOptions);

  if (results.length === 0) {
    console.log('No results found.');
    return;
  }

  console.log(`\nFound ${results.length} results:\n`);

  results.forEach((result, index) => {
    console.log(`[${index + 1}] Score: ${result.score.toFixed(4)}`);
    console.log(`    ID: ${result.chunkId}`);
    console.log(`    Content: ${result.content.substring(0, 200)}...`);
    if (result.metadata?.source) {
      console.log(`    Source: ${result.metadata.source}`);
    }
    console.log('');
  });
}

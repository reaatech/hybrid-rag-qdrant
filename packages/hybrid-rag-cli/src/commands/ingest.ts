/**
 * Ingest Command
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { DocumentLoader } from '@reaatech/hybrid-rag-ingestion';
import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

export interface IngestOptions {
  chunkSize: number;
  overlap: number;
  strategy: string;
  qdrantUrl: string;
  collection: string;
}

export async function ingestCommand(
  files: string[],
  options: IngestOptions,
  pipeline: RAGPipeline,
): Promise<void> {
  console.log(`Ingesting ${files.length} files...`);

  const loader = new DocumentLoader();
  const documents = [];

  for (const file of files) {
    try {
      const ext = extname(file).toLowerCase();
      let content: string;

      if (ext === '.json' || ext === '.jsonl') {
        content = await readFile(file, 'utf-8');
        if (ext === '.jsonl') {
          const lines = content.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            const doc = JSON.parse(line);
            documents.push({
              id: doc.id || file,
              content: doc.content || doc.text || '',
              metadata: doc.metadata || {},
            });
          }
          continue;
        }
      } else {
        const loaded = await loader.load(file);
        content = loaded.content;
      }

      documents.push({
        id: file,
        content,
        metadata: { source: file, ingested_at: new Date().toISOString() },
      });
    } catch (error) {
      console.error(`Error loading file ${file}:`, (error as Error).message);
    }
  }

  if (documents.length === 0) {
    console.log('No documents to ingest.');
    return;
  }

  console.log(`Processing ${documents.length} documents...`);

  const chunks = await pipeline.ingest(documents);

  console.log(`Successfully ingested ${chunks.length} chunks from ${documents.length} documents.`);
}

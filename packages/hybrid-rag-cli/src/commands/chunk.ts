/**
 * Chunk Command
 */

import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import type { ChunkingStrategy } from '@reaatech/hybrid-rag';
import { chunkDocument } from '@reaatech/hybrid-rag-ingestion';

export interface ChunkOptions {
  strategy: string;
  chunkSize: number;
  overlap: number;
  output: string;
}

export async function chunkCommand(file: string, options: ChunkOptions): Promise<void> {
  console.log(`Chunking file: ${file}`);
  console.log(`  Strategy: ${options.strategy}`);
  console.log(`  Chunk size: ${options.chunkSize}`);
  console.log(`  Overlap: ${options.overlap}`);

  // Read file
  const content = await readFile(file, 'utf-8');

  // Parse strategy
  const strategy = options.strategy as ChunkingStrategy;

  // Chunk document
  const chunks = await chunkDocument(content, file, {
    strategy,
    chunkSize: options.chunkSize,
    overlap: options.overlap,
  });

  // Output results
  const output = {
    file,
    strategy,
    total_chunks: chunks.length,
    chunks: chunks.map((chunk, index) => ({
      index,
      id: chunk.id,
      content: chunk.content,
      start_position: content.indexOf(chunk.content),
      end_position: content.indexOf(chunk.content) + chunk.content.length,
    })),
  };

  await writeFile(options.output, JSON.stringify(output, null, 2));

  console.log('\nChunking Results:');
  console.log(`  Total chunks: ${chunks.length}`);
  console.log(
    `  Average chunk size: ${Math.round(chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length)} chars`,
  );
  console.log(`\nResults saved to: ${options.output}`);
}

/**
 * Sliding window chunking strategy
 */

import type { Chunk, ChunkingConfig } from '../../types/domain.js';

/**
 * Options for sliding window chunking
 */
export interface SlidingWindowChunkingOptions {
  /** Window size in characters (default: 256) */
  windowSize?: number;
  /** Stride between windows (default: 128) */
  stride?: number;
}

/**
 * Sliding window chunking implementation
 * Creates overlapping windows across the document for dense coverage
 */
export class SlidingWindowChunker {
  private readonly windowSize: number;
  private readonly stride: number;

  constructor(options: SlidingWindowChunkingOptions = {}) {
    this.windowSize = options.windowSize ?? 256;
    this.stride = options.stride ?? 128;
    if (this.stride <= 0) {
      throw new Error(`Stride must be positive, got ${this.stride}`);
    }
  }

  /**
   * Chunk a document using sliding window
   */
  chunk(content: string, documentId: string, config: ChunkingConfig): Chunk[] {
    const windowSize = config.windowSize ?? this.windowSize;
    const stride = config.stride ?? this.stride;

    if (content.length === 0) {
      return [];
    }

    const chunks: Chunk[] = [];
    let start = 0;
    let index = 0;

    while (start < content.length) {
      const end = Math.min(start + windowSize, content.length);
      let chunkContent = content.slice(start, end);

      // Try to break at a natural boundary if not at end of document
      if (end < content.length) {
        const lastSpace = chunkContent.lastIndexOf(' ');
        const lastNewline = chunkContent.lastIndexOf('\n');
        const lastPeriod = chunkContent.lastIndexOf('.');

        const breakPoint = Math.max(lastSpace, lastNewline, lastPeriod);

        if (breakPoint > windowSize * 0.3) {
          chunkContent = chunkContent.slice(0, breakPoint + 1);
        }
      }

      chunkContent = chunkContent.trim();

      if (chunkContent.length > 0) {
        chunks.push({
          id: this.generateChunkId(documentId, index, config.seed),
          documentId,
          index,
          content: chunkContent,
          tokenCount: this.estimateTokenCount(chunkContent),
          characterCount: chunkContent.length,
          startPosition: start,
          endPosition: start + chunkContent.length,
          metadata: {},
          strategy: config.strategy,
        });
      }

      start += stride;
      index++;

      // Avoid infinite loop if stride is 0
      if (stride <= 0) {break;}
    }

    return chunks;
  }

  /**
   * Estimate token count
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate deterministic chunk ID
   */
  private generateChunkId(documentId: string, index: number, seed?: number): string {
    const seedStr = seed !== undefined ? `-${seed}` : '';
    return `chunk-${documentId}-${index}${seedStr}`;
  }
}

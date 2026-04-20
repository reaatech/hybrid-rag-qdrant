/**
 * Fixed-size chunking strategy
 */

import { get_encoding, type TiktokenEncoding } from 'tiktoken';
import type { Chunk, ChunkingConfig } from '../../types/domain.js';

/**
 * Fixed-size chunking mode
 */
export type FixedSizeMode = 'character' | 'word' | 'token';

/**
 * Options for fixed-size chunking
 */
export interface FixedSizeChunkingOptions {
  /** Chunking mode (default: 'token') */
  mode?: FixedSizeMode;
  /** Chunk size (default: 512) */
  chunkSize?: number;
  /** Overlap between chunks (default: 50) */
  overlap?: number;
  /** Encoding name for token-based chunking (default: 'cl100k_base') */
  encodingName?: string;
}

/**
 * Fixed-size chunking implementation
 */
export class FixedSizeChunker {
  private readonly mode: FixedSizeMode;
  private readonly chunkSize: number;
  private readonly overlap: number;
  private readonly encodingName: string;
  private encoder: ReturnType<typeof get_encoding> | null = null;

  constructor(options: FixedSizeChunkingOptions = {}) {
    this.mode = options.mode ?? 'token';
    this.chunkSize = options.chunkSize ?? 512;
    this.overlap = options.overlap ?? 50;
    this.encodingName = options.encodingName ?? 'cl100k_base';
    if (this.overlap >= this.chunkSize) {
      throw new Error(`Overlap (${this.overlap}) must be less than chunk size (${this.chunkSize})`);
    }
  }

  /**
   * Get or create the tokenizer
   */
  private getEncoder(): ReturnType<typeof get_encoding> {
    if (!this.encoder) {
      this.encoder = get_encoding(this.encodingName as TiktokenEncoding);
    }
    return this.encoder;
  }

  /**
   * Chunk a document into fixed-size pieces
   */
  chunk(content: string, documentId: string, config: ChunkingConfig): Chunk[] {
    const chunks: Chunk[] = [];
    const effectiveChunkSize = config.chunkSize || this.chunkSize;
    const effectiveOverlap = config.overlap ?? this.overlap;

    let segments: string[];

    switch (this.mode) {
      case 'character':
        segments = this.chunkByCharacter(content, effectiveChunkSize, effectiveOverlap);
        break;
      case 'word':
        segments = this.chunkByWord(content, effectiveChunkSize, effectiveOverlap);
        break;
      case 'token':
        segments = this.chunkByToken(content, effectiveChunkSize, effectiveOverlap);
        break;
    }

    let position = 0;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i] ?? '';
      const tokenCount = this.countTokens(segment);

      chunks.push({
        id: this.generateChunkId(documentId, i, config.seed),
        documentId,
        index: i,
        content: segment,
        tokenCount,
        characterCount: segment.length,
        startPosition: position,
        endPosition: position + segment.length,
        metadata: {},
        strategy: config.strategy,
      });

      position += segment.length;
    }

    return chunks;
  }

  /**
   * Chunk by character count
   */
  private chunkByCharacter(content: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      let chunk = content.slice(start, end);

      // Try to break at a sentence boundary
      if (end < content.length) {
        const lastPeriod = chunk.lastIndexOf('.');
        const lastNewline = chunk.lastIndexOf('\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > chunkSize * 0.5) {
          chunk = chunk.slice(0, breakPoint + 1);
        }
      }

      chunks.push(chunk.trim());
      start = end - overlap;

      if (start >= content.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Chunk by word count
   */
  private chunkByWord(content: string, chunkSize: number, overlap: number): string[] {
    const words = content.split(/\s+/);
    const chunks: string[] = [];
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + chunkSize, words.length);
      const chunk = words.slice(start, end).join(' ');
      chunks.push(chunk);

      start = end - overlap;
      if (start >= words.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Chunk by token count
   */
  private chunkByToken(content: string, chunkSize: number, overlap: number): string[] {
    const encoder = this.getEncoder();
    const tokens = encoder.encode(content);
    const chunks: string[] = [];
    let start = 0;

    while (start < tokens.length) {
      const end = Math.min(start + chunkSize, tokens.length);
      const tokenChunk = tokens.slice(start, end);
      const chunk = new TextDecoder().decode(encoder.decode(tokenChunk));
      chunks.push(chunk);

      start = end - overlap;
      if (start >= tokens.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Count tokens in text
   */
  private countTokens(text: string): number {
    if (this.mode === 'token') {
      return this.getEncoder().encode(text).length;
    }

    if (this.mode === 'word') {
      return text.split(/\s+/).filter(Boolean).length;
    }

    return text.length;
  }

  /**
   * Generate deterministic chunk ID
   */
  private generateChunkId(documentId: string, index: number, seed?: number): string {
    const seedStr = seed !== undefined ? `-${seed}` : '';
    return `chunk-${documentId}-${index}${seedStr}`;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.encoder) {
      this.encoder.free();
      this.encoder = null;
    }
  }
}

/**
 * Chunking orchestration engine
 */

import type { Chunk, ChunkingConfig, Document } from '../types/domain.js';
import { ChunkingStrategy } from '../types/domain.js';
import { FixedSizeChunker } from './strategies/fixed-size.js';
import { SemanticChunker } from './strategies/semantic.js';
import { RecursiveChunker } from './strategies/recursive.js';
import { SlidingWindowChunker } from './strategies/sliding-window.js';

/**
 * Chunking result with metadata
 */
export interface ChunkingResult {
  /** Generated chunks */
  chunks: Chunk[];
  /** Statistics about chunking */
  stats: {
    totalChunks: number;
    avgChunkSize: number;
    minChunkSize: number;
    maxChunkSize: number;
    totalTokens: number;
    processingTimeMs: number;
  };
}

/**
 * Chunking engine that orchestrates different chunking strategies
 */
export class ChunkingEngine {
  private readonly fixedSizeChunker: FixedSizeChunker;
  private readonly semanticChunker: SemanticChunker;
  private readonly recursiveChunker: RecursiveChunker;
  private readonly slidingWindowChunker: SlidingWindowChunker;

  constructor() {
    this.fixedSizeChunker = new FixedSizeChunker();
    this.semanticChunker = new SemanticChunker();
    this.recursiveChunker = new RecursiveChunker();
    this.slidingWindowChunker = new SlidingWindowChunker();
  }

  /**
   * Chunk a document using the specified configuration
   */
  chunk(content: string, documentId: string, config: ChunkingConfig): ChunkingResult {
    const startTime = performance.now();

    let chunks: Chunk[];

    switch (config.strategy) {
      case ChunkingStrategy.FIXED_SIZE:
        chunks = this.fixedSizeChunker.chunk(content, documentId, config);
        break;
      case ChunkingStrategy.SEMANTIC:
        chunks = this.semanticChunker.chunk(content, documentId, config);
        break;
      case ChunkingStrategy.RECURSIVE:
        chunks = this.recursiveChunker.chunk(content, documentId, config);
        break;
      case ChunkingStrategy.SLIDING_WINDOW:
        chunks = this.slidingWindowChunker.chunk(content, documentId, config);
        break;
      default:
        throw new Error(`Unknown chunking strategy: ${config.strategy}`);
    }

    const endTime = performance.now();
    const processingTimeMs = endTime - startTime;

    // Calculate statistics
    const stats = this.calculateStats(chunks, processingTimeMs);

    return {
      chunks,
      stats,
    };
  }

  /**
   * Chunk multiple documents
   */
  chunkBatch(documents: Document[], config: ChunkingConfig): ChunkingResult[] {
    return documents.map((doc) => this.chunk(doc.content, doc.id, config));
  }

  /**
   * Calculate chunking statistics
   */
  private calculateStats(chunks: Chunk[], processingTimeMs: number) {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        avgChunkSize: 0,
        minChunkSize: 0,
        maxChunkSize: 0,
        totalTokens: 0,
        processingTimeMs,
      };
    }

    const sizes = chunks.map((c) => c.characterCount);
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

    return {
      totalChunks: chunks.length,
      avgChunkSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
      minChunkSize: sizes.reduce((a, b) => Math.min(a, b)),
      maxChunkSize: sizes.reduce((a, b) => Math.max(a, b)),
      totalTokens,
      processingTimeMs: Math.round(processingTimeMs * 100) / 100,
    };
  }

  /**
   * Validate chunking configuration
   */
  static validateConfig(config: ChunkingConfig): string[] {
    const errors: string[] = [];

    if (!Object.values(ChunkingStrategy).includes(config.strategy)) {
      errors.push(`Invalid chunking strategy: ${config.strategy}`);
    }

    if (config.chunkSize <= 0) {
      errors.push('Chunk size must be positive');
    }

    if (config.overlap < 0) {
      errors.push('Overlap must be non-negative');
    }

    if (config.overlap >= config.chunkSize) {
      errors.push('Overlap must be less than chunk size');
    }

    if (config.stride !== undefined && config.stride <= 0) {
      errors.push('Stride must be positive');
    }

    if (config.similarityThreshold !== undefined) {
      if (config.similarityThreshold < 0 || config.similarityThreshold > 1) {
        errors.push('Similarity threshold must be between 0 and 1');
      }
    }

    return errors;
  }

  /**
   * Get default configuration for a strategy
   */
  static getDefaultConfig(strategy: ChunkingStrategy): ChunkingConfig {
    switch (strategy) {
      case ChunkingStrategy.FIXED_SIZE:
        return {
          strategy: ChunkingStrategy.FIXED_SIZE,
          chunkSize: 512,
          overlap: 50,
        };
      case ChunkingStrategy.SEMANTIC:
        return {
          strategy: ChunkingStrategy.SEMANTIC,
          chunkSize: 512,
          overlap: 0,
          similarityThreshold: 0.5,
        };
      case ChunkingStrategy.RECURSIVE:
        return {
          strategy: ChunkingStrategy.RECURSIVE,
          chunkSize: 512,
          overlap: 50,
          separators: ['\n## ', '\n### ', '\n\n', '\n', '. ', ' '],
        };
      case ChunkingStrategy.SLIDING_WINDOW:
        return {
          strategy: ChunkingStrategy.SLIDING_WINDOW,
          chunkSize: 256,
          overlap: 128,
          windowSize: 256,
          stride: 128,
        };
    }
  }
}

const chunkingEngine = new ChunkingEngine();

export async function chunkDocument(
  content: string,
  documentId: string,
  config: ChunkingConfig,
  _metadata?: Record<string, unknown>,
): Promise<Chunk[]> {
  const result = chunkingEngine.chunk(content, documentId, config);
  return result.chunks;
}

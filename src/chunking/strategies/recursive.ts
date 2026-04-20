/**
 * Recursive character chunking strategy
 */

import type { Chunk, ChunkingConfig } from '../../types/domain.js';

/**
 * Options for recursive chunking
 */
export interface RecursiveChunkingOptions {
  /** Separators in order of preference (default: ['\n## ', '\n### ', '\n', '. ', ' ']) */
  separators?: string[];
  /** Whether to keep separators in chunks (default: false) */
  keepSeparator?: boolean;
}

/**
 * Default separators for recursive chunking
 */
const DEFAULT_SEPARATORS = ['\n## ', '\n### ', '\n#### ', '\n##### ', '\n\n', '\n', '. ', ' ', ''];

/**
 * Recursive character chunking implementation
 * Splits text hierarchically by separators, preserving document structure
 */
export class RecursiveChunker {
  private readonly separators: string[];
  private readonly keepSeparator: boolean;

  constructor(options: RecursiveChunkingOptions = {}) {
    this.separators = options.separators ?? DEFAULT_SEPARATORS;
    this.keepSeparator = options.keepSeparator ?? false;
  }

  /**
   * Chunk a document into recursive pieces
   */
  chunk(content: string, documentId: string, config: ChunkingConfig): Chunk[] {
    const chunkSize = config.chunkSize ?? 512;
    const overlap = config.overlap ?? 50;
    const separators = config.separators ?? this.separators;

    // Recursively split the content
    const segments = this.recursiveSplit(content, separators, chunkSize);

    // Merge small segments and apply overlap
    const mergedSegments = this.mergeAndOverlap(segments, chunkSize, overlap);

    // Convert to chunks
    const chunks: Chunk[] = [];
    let position = 0;

    for (let i = 0; i < mergedSegments.length; i++) {
      const segment = mergedSegments[i] ?? '';
      if (segment.trim().length === 0) {
        continue;
      }

      const startIndex = content.indexOf(segment.slice(0, 50), position);
      const startPos = startIndex >= 0 ? startIndex : position;

      chunks.push({
        id: this.generateChunkId(documentId, chunks.length, config.seed),
        documentId,
        index: chunks.length,
        content: segment.trim(),
        tokenCount: this.estimateTokenCount(segment),
        characterCount: segment.length,
        startPosition: startPos,
        endPosition: startPos + segment.length,
        metadata: {},
        strategy: config.strategy,
      });

      position = startPos + segment.length;
    }

    return chunks;
  }

  /**
   * Iteratively split text by separators (avoids stack overflow on large documents)
   */
  private recursiveSplit(text: string, separators: string[], chunkSize: number): string[] {
    let queue: Array<{ content: string; sepIndex: number }> = [{ content: text, sepIndex: 0 }];
    const result: string[] = [];

    while (queue.length > 0) {
      const next: Array<{ content: string; sepIndex: number }> = [];

      for (const item of queue) {
        if (item.content.length <= chunkSize || item.sepIndex >= separators.length) {
          if (item.content.trim().length > 0) {
            result.push(item.content);
          }
          continue;
        }

        const separator = separators[item.sepIndex];
        if (!separator && separator !== '') {
          if (item.content.trim().length > 0) {
            result.push(item.content);
          }
          continue;
        }

        const parts = this.splitWithSeparator(item.content, separator);

        if (parts.every((p) => p.length <= chunkSize)) {
          for (const p of parts) {
            if (p.trim().length > 0) {
              result.push(p);
            }
          }
          continue;
        }

        for (const part of parts) {
          if (part.length > chunkSize) {
            next.push({ content: part, sepIndex: item.sepIndex + 1 });
          } else if (part.trim().length > 0) {
            result.push(part);
          }
        }
      }

      queue = next;
    }

    return result;
  }

  /**
   * Split text by separator, optionally keeping the separator
   */
  private splitWithSeparator(text: string, separator: string): string[] {
    if (separator === '') {
      // Split into individual characters
      return text.split('');
    }

    if (this.keepSeparator) {
      // Keep separator with the preceding text
      const parts = text.split(separator);
      const result: string[] = [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] ?? '';
        if (i < parts.length - 1) {
          result.push(part + separator);
        } else if (part.trim().length > 0) {
          result.push(part);
        }
      }

      return result;
    }

    return text.split(separator);
  }

  /**
   * Merge small segments and apply overlap
   */
  private mergeAndOverlap(segments: string[], chunkSize: number, overlap: number): string[] {
    const result: string[] = [];
    let current = '';

    for (const segment of segments) {
      const combined = current ? `${current}\n${segment}` : segment;

      if (combined.length <= chunkSize) {
        current = combined;
      } else {
        if (current.trim().length > 0) {
          result.push(current);
        }
        current = segment;
      }
    }

    if (current.trim().length > 0) {
      result.push(current);
    }

    // Apply overlap by prepending end of previous chunk
    if (overlap > 0 && result.length > 1) {
      const withOverlap: string[] = [result[0] ?? ''];

      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1] ?? '';
        const curr = result[i] ?? '';

        // Get overlap text from end of previous chunk
        const overlapStart = Math.max(0, prev.length - overlap);
        const overlapText = prev.slice(overlapStart);

        // Find a good break point in the overlap
        const breakPoint = overlapText.indexOf('\n');
        const prefix = breakPoint >= 0 ? overlapText.slice(0, breakPoint + 1) : overlapText;

        withOverlap.push(prefix + curr);
      }

      return withOverlap;
    }

    return result;
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

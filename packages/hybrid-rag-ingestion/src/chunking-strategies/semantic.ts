/**
 * Semantic chunking strategy
 */

import type { Chunk, ChunkingConfig } from '@reaatech/hybrid-rag';

/**
 * Options for semantic chunking
 */
export interface SemanticChunkingOptions {
  /** Similarity threshold for splitting (default: 0.5) */
  similarityThreshold?: number;
  /** Minimum chunk size in characters (default: 100) */
  minChunkSize?: number;
  /** Maximum chunk size in characters (default: 2000) */
  maxChunkSize?: number;
  /** Sentence splitter function */
  sentenceSplitter?: (text: string) => string[];
}

/**
 * Simple sentence splitter (fallback)
 */
function defaultSentenceSplitter(text: string): string[] {
  // Split on sentence boundaries (. ! ? followed by space or newline)
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return sentences.filter((s) => s.trim().length > 0);
}

/**
 * Semantic chunking implementation
 * Splits text at semantic boundaries where similarity drops below threshold
 */
export class SemanticChunker {
  private readonly similarityThreshold: number;
  private readonly minChunkSize: number;
  private readonly maxChunkSize: number;
  private readonly sentenceSplitter: (text: string) => string[];

  constructor(options: SemanticChunkingOptions = {}) {
    this.similarityThreshold = options.similarityThreshold ?? 0.5;
    this.minChunkSize = options.minChunkSize ?? 100;
    this.maxChunkSize = options.maxChunkSize ?? 2000;
    this.sentenceSplitter = options.sentenceSplitter ?? defaultSentenceSplitter;
  }

  /**
   * Chunk a document into semantic pieces
   */
  chunk(content: string, documentId: string, config: ChunkingConfig): Chunk[] {
    const sentences = this.sentenceSplitter(content);

    if (sentences.length === 0) {
      return [];
    }

    const groups = this.groupBySimilarity(sentences);

    const chunks: Chunk[] = [];
    let position = 0;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i] ?? [];
      const chunkContent = group.join(' ').trim();

      if (!chunkContent || (chunkContent.length < this.minChunkSize && i < groups.length - 1)) {
        continue;
      }

      const startPos = position;

      chunks.push({
        id: this.generateChunkId(documentId, i, config.seed),
        documentId,
        index: i,
        content: chunkContent,
        tokenCount: this.estimateTokenCount(chunkContent),
        characterCount: chunkContent.length,
        startPosition: startPos,
        endPosition: startPos + chunkContent.length,
        metadata: {},
        strategy: config.strategy,
      });

      position = startPos + chunkContent.length;
    }

    return chunks.filter((c) => c.content.length > 0);
  }

  /**
   * Group sentences by semantic similarity
   */
  private groupBySimilarity(sentences: string[]): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i] ?? '';

      if (currentGroup.length === 0) {
        currentGroup.push(sentence);
        continue;
      }

      // Check if we should start a new group
      const currentText = currentGroup.join(' ');
      const similarity = this.computeTextSimilarity(currentText, sentence);

      const groupSize = currentText.length + sentence.length;
      const shouldSplit = similarity < this.similarityThreshold || groupSize > this.maxChunkSize;

      if (shouldSplit && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [sentence];
      } else {
        currentGroup.push(sentence);
      }
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Compute similarity between two texts using simple word overlap
   * Note: For production, this should use embeddings-based similarity
   */
  private computeTextSimilarity(text1: string, text2: string): number {
    const words1 = this.getWordSet(text1.toLowerCase());
    const words2 = this.getWordSet(text2.toLowerCase());

    if (words1.size === 0 || words2.size === 0) {
      return 0;
    }

    // Jaccard similarity
    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Get set of significant words from text
   */
  private getWordSet(text: string): Set<string> {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'shall',
      'can',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'as',
      'if',
      'when',
      'than',
      'so',
      'not',
      'no',
      'nor',
      'too',
      'very',
      'just',
    ]);

    const words = text.split(/\s+/);
    return new Set(words.filter((w) => w.length > 2 && !stopWords.has(w)));
  }

  /**
   * Estimate token count
   */
  private estimateTokenCount(text: string): number {
    // Rough estimate: ~4 characters per token for English
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

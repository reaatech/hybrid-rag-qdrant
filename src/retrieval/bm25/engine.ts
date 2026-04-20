/**
 * BM25 (Okapi BM25) ranking function implementation
 */

import { Tokenizer, type TokenizerConfig } from './tokenizer.js';

/**
 * BM25 configuration
 */
export interface BM25Config {
  /** k1 parameter (default: 1.2) - controls term frequency saturation */
  k1?: number;
  /** b parameter (default: 0.75) - controls length normalization */
  b?: number;
  /** Tokenizer configuration */
  tokenizer?: TokenizerConfig;
}

/**
 * Document index entry
 */
interface DocumentIndexEntry {
  /** Document/chunk ID */
  id: string;
  /** Term frequencies for this document */
  termFrequencies: Map<string, number>;
  /** Document length (number of tokens) */
  length: number;
  /** Original content */
  content: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * BM25 index and search engine
 */
export class BM25Engine {
  private readonly k1: number;
  private readonly b: number;
  private readonly tokenizer: Tokenizer;

  /** Document entries indexed by ID */
  private readonly documents: Map<string, DocumentIndexEntry> = new Map();

  /** Inverted index: term -> set of document IDs */
  private readonly invertedIndex: Map<string, Set<string>> = new Map();

  /** Document frequency: term -> number of documents containing term */
  private readonly documentFrequencies: Map<string, number> = new Map();

  /** Average document length */
  private avgDocLength: number = 0;

  /** Total number of documents */
  private totalDocs: number = 0;

  constructor(config: BM25Config = {}) {
    this.k1 = config.k1 ?? 1.2;
    this.b = config.b ?? 0.75;
    this.tokenizer = new Tokenizer(config.tokenizer);
  }

  /**
   * Add a document to the index
   */
  addDocument(id: string, content: string, metadata: Record<string, unknown> = {}): void {
    if (this.documents.has(id)) {
      this.removeDocument(id);
    }

    const termCounts = this.tokenizer.tokenizeWithCounts(content);
    const terms = [...termCounts.keys()];
    const docLength = terms.reduce((sum, term) => sum + (termCounts.get(term) ?? 0), 0);

    // Create document entry
    const entry: DocumentIndexEntry = {
      id,
      termFrequencies: termCounts,
      length: docLength,
      content,
      metadata,
    };

    this.documents.set(id, entry);

    // Update inverted index
    for (const term of terms) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term)?.add(id);

      // Update document frequency
      this.documentFrequencies.set(term, (this.documentFrequencies.get(term) ?? 0) + 1);
    }

    // Update statistics
    this.totalDocs = this.documents.size;
    this.avgDocLength = this.calculateAvgDocLength();
  }

  /**
   * Add multiple documents to the index
   */
  addDocuments(
    documents: { id: string; content: string; metadata?: Record<string, unknown> }[],
  ): void {
    for (const doc of documents) {
      this.addDocument(doc.id, doc.content, doc.metadata ?? {});
    }
  }

  /**
   * Remove a document from the index
   */
  removeDocument(id: string): void {
    const entry = this.documents.get(id);
    if (!entry) {
      return;
    }

    // Remove from inverted index
    for (const [term, docIds] of this.invertedIndex) {
      if (docIds.has(id)) {
        docIds.delete(id);
        if (docIds.size === 0) {
          this.invertedIndex.delete(term);
          this.documentFrequencies.delete(term);
        } else {
          this.documentFrequencies.set(term, this.documentFrequencies.get(term)! - 1);
        }
      }
    }

    this.documents.delete(id);
    this.totalDocs = this.documents.size;
    this.avgDocLength = this.calculateAvgDocLength();
  }

  /**
   * Search for documents matching a query
   */
  search(query: string, topK: number = 10): BM25SearchResult[] {
    const queryTerms = this.tokenizer.tokenize(query);

    if (this.totalDocs === 0 || this.avgDocLength === 0) {
      return [];
    }

    const scores: Map<string, number> = new Map();

    for (const term of queryTerms) {
      const docIds = this.invertedIndex.get(term);
      if (!docIds || docIds.size === 0) {
        continue;
      }

      const df = this.documentFrequencies.get(term) ?? 0;
      const idf = this.calculateIDF(df);

      for (const docId of docIds) {
        const entry = this.documents.get(docId);
        if (!entry) {
          continue;
        }

        const tf = entry.termFrequencies.get(term) ?? 0;
        const score = this.calculateBM25Score(tf, idf, entry.length);

        const currentScore = scores.get(docId) ?? 0;
        scores.set(docId, currentScore + score);
      }
    }

    // Sort by score and return top-K
    const results = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docId, score]) => {
        const entry = this.documents.get(docId);
        return {
          chunkId: docId,
          documentId: (entry?.metadata?.documentId as string) ?? '',
          content: entry?.content ?? '',
          score,
          source: 'bm25' as const,
          metadata: entry?.metadata ?? {},
        };
      });

    return results;
  }

  /**
   * Calculate BM25 score for a term
   */
  private calculateBM25Score(tf: number, idf: number, docLength: number): number {
    const numerator = idf * (this.k1 + 1) * tf;
    const denominator = this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)) + tf;
    return numerator / denominator;
  }

  /**
   * Calculate IDF for a term
   */
  private calculateIDF(docFrequency: number): number {
    return Math.log(1 + (this.totalDocs - docFrequency + 0.5) / (docFrequency + 0.5));
  }

  /**
   * Calculate average document length
   */
  private calculateAvgDocLength(): number {
    if (this.totalDocs === 0) {
      return 0;
    }

    let totalLength = 0;
    for (const entry of this.documents.values()) {
      totalLength += entry.length;
    }

    return totalLength / this.totalDocs;
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalDocuments: number;
    totalTerms: number;
    avgDocLength: number;
  } {
    return {
      totalDocuments: this.totalDocs,
      totalTerms: this.invertedIndex.size,
      avgDocLength: this.avgDocLength,
    };
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.documents.clear();
    this.invertedIndex.clear();
    this.documentFrequencies.clear();
    this.totalDocs = 0;
    this.avgDocLength = 0;
  }
}

/**
 * BM25 search result
 */
export interface BM25SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  source: 'bm25';
  metadata: Record<string, unknown>;
}

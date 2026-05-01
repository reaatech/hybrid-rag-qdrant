/**
 * Core domain types for hybrid-rag-qdrant
 */

// ============================================================================
// Document Types
// ============================================================================

/**
 * Represents a source document with metadata
 */
export interface Document {
  /** Unique document identifier */
  id: string;
  /** The full text content of the document */
  content: string;
  /** Source URI or file path */
  source: string;
  /** Document title */
  title?: string;
  /** Document author */
  author?: string;
  /** Document creation or modification date */
  date?: string;
  /** Custom metadata */
  metadata: Record<string, unknown>;
  /** Content hash for duplicate detection */
  contentHash?: string;
  /** File size in bytes */
  fileSize?: number;
  /** MIME type */
  contentType?: string;
}

// ============================================================================
// Chunk Types
// ============================================================================

/**
 * Chunking strategy types
 */
export enum ChunkingStrategy {
  FIXED_SIZE = 'fixed-size',
  SEMANTIC = 'semantic',
  RECURSIVE = 'recursive',
  SLIDING_WINDOW = 'sliding-window',
}

/**
 * Configuration for chunking
 */
export interface ChunkingConfig {
  /** The chunking strategy to use */
  strategy: ChunkingStrategy;
  /** Target chunk size (in tokens for token-based strategies) */
  chunkSize: number;
  /** Overlap between chunks (in tokens or characters) */
  overlap: number;
  /** Seed for deterministic chunk ID generation */
  seed?: number;
  /** For semantic chunking: similarity threshold for splitting */
  similarityThreshold?: number;
  /** For recursive chunking: separators in order of preference */
  separators?: string[];
  /** For sliding window: window size */
  windowSize?: number;
  /** For sliding window: stride between windows */
  stride?: number;
}

/**
 * Represents a text chunk with metadata
 */
export interface Chunk {
  /** Unique chunk identifier (deterministic based on document + index) */
  id: string;
  /** Parent document ID */
  documentId: string;
  /** Chunk index within the document */
  index: number;
  /** The text content of the chunk */
  content: string;
  /** Embedding vector (if generated) */
  embedding?: number[];
  /** Token count */
  tokenCount: number;
  /** Character count */
  characterCount: number;
  /** Start position in original document */
  startPosition: number;
  /** End position in original document */
  endPosition: number;
  /** Metadata inherited from document */
  metadata: Record<string, unknown>;
  /** Chunking strategy used */
  strategy: ChunkingStrategy;
}

// ============================================================================
// Retrieval Types
// ============================================================================

/**
 * Vector search query
 */
export interface VectorQuery {
  /** Query embedding vector */
  vector: number[];
  /** Number of results to return */
  topK: number;
  /** Similarity metric (cosine, euclidean, dot) */
  distance?: 'cosine' | 'euclidean' | 'dot';
  /** Metadata filters */
  filter?: Record<string, unknown>;
  /** Collection name */
  collection?: string;
}

/**
 * BM25 sparse search query
 */
export interface BM25Query {
  /** Query text (will be tokenized) */
  query: string;
  /** Number of results to return */
  topK: number;
  /** BM25 k1 parameter */
  k1?: number;
  /** BM25 b parameter */
  b?: number;
  /** Metadata filters */
  filter?: Record<string, unknown>;
}

/**
 * Single retrieval result
 */
export interface RetrievalResult {
  /** Chunk ID */
  chunkId: string;
  /** Document ID */
  documentId: string;
  /** Chunk content */
  content: string;
  /** Retrieval score */
  score: number;
  /** Source of the score (vector, bm25, etc.) */
  source: 'vector' | 'bm25';
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Fused hybrid retrieval results
 */
export interface HybridResult {
  /** Combined results after fusion */
  results: Array<{
    chunkId: string;
    documentId: string;
    content: string;
    /** Fused score */
    score: number;
    /** Original vector score */
    vectorScore?: number;
    /** Original BM25 score */
    bm25Score?: number;
    /** Vector rank */
    vectorRank?: number;
    /** BM25 rank */
    bm25Rank?: number;
    metadata: Record<string, unknown>;
  }>;
  /** Fusion strategy used */
  fusionStrategy: string;
  /** Total number of candidates before fusion */
  totalCandidates: number;
}

/**
 * Reranked results
 */
export interface RerankedResult {
  /** Final ranked results */
  results: Array<{
    chunkId: string;
    documentId: string;
    content: string;
    /** Reranker relevance score */
    rerankerScore: number;
    /** Original fused score */
    fusedScore: number;
    /** Combined score */
    finalScore: number;
    metadata: Record<string, unknown>;
  }>;
  /** Reranker provider used */
  rerankerProvider: string;
  /** Number of documents reranked */
  rerankedCount: number;
}

// ============================================================================
// Evaluation Types
// ============================================================================

/**
 * Ground truth evaluation sample
 */
export interface EvaluationSample {
  /** Unique query identifier */
  query_id: string;
  /** The query text */
  query: string;
  /** List of relevant document IDs */
  relevant_docs: string[];
  /** List of relevant chunk IDs */
  relevant_chunks: string[];
  /** Ideal answer (optional, for generation metrics) */
  ideal_answer?: string;
}

/**
 * Evaluation metrics output
 */
export interface EvaluationResult {
  /** Per-query results */
  perQuery: Array<{
    queryId: string;
    metrics: {
      precisionAtK: number;
      recallAtK: number;
      ndcgAtK: number;
      mrr: number;
      averagePrecision: number;
    };
  }>;
  /** Aggregate summary metrics */
  summary: {
    precisionAtK: number;
    recallAtK: number;
    ndcgAtK: number;
    map: number;
    mrr: number;
    /** Standard deviations */
    stdDev?: {
      precisionAtK: number;
      recallAtK: number;
      ndcgAtK: number;
      map: number;
      mrr: number;
    };
  };
  /** Configuration used for evaluation */
  config: {
    topK: number;
    metrics: string[];
    datasetSize: number;
  };
}

// ============================================================================
// Ablation Study Types
// ============================================================================

/**
 * Configuration for ablation study
 */
export interface AblationConfig {
  /** Baseline configuration */
  baseline: {
    chunking: string;
    chunkSize: number;
    overlap: number;
    retrieval: string;
    vectorWeight: number;
    bm25Weight: number;
    reranker: string | null;
    topK: number;
  };
  /** Variants to test */
  variants: Array<{
    name: string;
    description?: string;
    changes: Partial<AblationConfig['baseline']>;
  }>;
}

/**
 * Ablation study results
 */
export interface AblationResult {
  /** Baseline metrics */
  baseline: {
    metrics: EvaluationResult['summary'];
    costPerQuery: number;
  };
  /** Variant results */
  variants: Array<{
    name: string;
    description?: string;
    metrics: EvaluationResult['summary'];
    costPerQuery: number;
    delta: {
      ndcgAtK: number;
      map: number;
      mrr: number;
      costPerQuery: number;
    };
  }>;
}

// ============================================================================
// Benchmarking Types
// ============================================================================

/**
 * Performance benchmark result
 */
export interface BenchmarkResult {
  /** Latency percentiles (in milliseconds) */
  latency: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    mean: number;
    min: number;
    max: number;
  };
  /** Per-component latency breakdown */
  componentLatency: {
    embedding?: { p50: number; p90: number; p99: number };
    vectorSearch?: { p50: number; p90: number; p99: number };
    bm25Search?: { p50: number; p90: number; p99: number };
    fusion?: { p50: number; p90: number; p99: number };
    reranking?: { p50: number; p90: number; p99: number };
  };
  /** Cost breakdown (USD per query) */
  cost: {
    embedding: number;
    vectorSearch: number;
    reranking: number;
    total: number;
  };
  /** Throughput metrics */
  throughput: {
    queriesPerSecond: number;
    concurrentQueries: number;
  };
  /** Environment details for reproducibility */
  environment: {
    timestamp: string;
    nodeVersion: string;
    platform: string;
    cpuModel: string;
    memoryGB: number;
  };
}

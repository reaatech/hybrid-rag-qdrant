/**
 * Ablation study configuration
 */

/**
 * Chunking strategy options for ablation
 */
export type AblationChunking = 'fixed-size' | 'semantic' | 'recursive' | 'sliding-window';

/**
 * Retrieval mode options for ablation
 */
export type AblationRetrieval = 'hybrid' | 'vector' | 'bm25';

/**
 * Reranker options for ablation
 */
export type AblationReranker = 'cohere' | 'jina' | 'openai' | 'local' | null;

/**
 * Ablation variant configuration
 */
export interface AblationVariant {
  /** Name of the variant */
  name: string;
  /** Description of what changed */
  description?: string;
  /** Configuration changes from baseline */
  changes: Partial<{
    chunking: AblationChunking;
    chunkSize: number;
    overlap: number;
    retrieval: AblationRetrieval;
    vectorWeight: number;
    bm25Weight: number;
    reranker: AblationReranker;
    topK: number;
  }>;
}

/**
 * Ablation study configuration
 */
export interface AblationConfig {
  /** Baseline configuration */
  baseline: {
    chunking: AblationChunking;
    chunkSize: number;
    overlap: number;
    retrieval: AblationRetrieval;
    vectorWeight: number;
    bm25Weight: number;
    reranker: AblationReranker;
    topK: number;
  };
  /** Variants to test */
  variants: AblationVariant[];
}

/**
 * Default baseline configuration
 */
export const DEFAULT_BASELINE = {
  chunking: 'fixed-size' as AblationChunking,
  chunkSize: 512,
  overlap: 50,
  retrieval: 'hybrid' as AblationRetrieval,
  vectorWeight: 0.7,
  bm25Weight: 0.3,
  reranker: 'cohere' as AblationReranker,
  topK: 10,
};

/**
 * Validate ablation configuration
 */
export function validateAblationConfig(config: AblationConfig): boolean {
  // Check baseline has required fields
  const baseline = config.baseline;
  if (
    !baseline.chunking ||
    !baseline.retrieval ||
    baseline.vectorWeight === undefined ||
    baseline.bm25Weight === undefined
  ) {
    return false;
  }

  // Check weights sum to 1 for hybrid
  if (baseline.retrieval === 'hybrid') {
    if (Math.abs(baseline.vectorWeight + baseline.bm25Weight - 1) > 0.01) {
      return false;
    }
  }

  // Check variants have names
  for (const variant of config.variants) {
    if (!variant.name) {
      return false;
    }
  }

  return true;
}

/**
 * Fusion module exports
 */

export {
  applyFusion,
  reciprocalRankFusion,
  weightedSumFusion,
  normalizedFusion,
  type FusionConfig,
  type FusionStrategyType,
} from './strategies.js';

export { HybridRetrievalEngine, type HybridRetrievalConfig } from './engine.js';

export {
  normalize,
  minMaxNormalize,
  zScoreNormalize,
  rankNormalize,
  type NormalizationMethod,
} from './normalization.js';

export {
  HybridRetriever,
  type HybridRetrieverConfig,
  type HybridRetrievalOptions,
} from './hybrid-retriever.js';

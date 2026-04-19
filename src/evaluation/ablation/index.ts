/**
 * Ablation study module exports
 */

export {
  AblationRunner,
  runAblation,
  type AblationVariantResult,
  type AblationResults,
  type PipelineBuilderFn,
} from './runner.js';

export {
  generateMarkdownTable,
  generateSummary,
  sortByNDCG,
  sortByDelta,
} from './reporter.js';

export {
  validateAblationConfig,
  DEFAULT_BASELINE,
  type AblationConfig,
  type AblationVariant,
  type AblationChunking,
  type AblationRetrieval,
  type AblationReranker,
} from './config.js';

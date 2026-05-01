export {
  EvaluationRunner,
  runEvaluation,
  type QueryFunction,
  type EvaluationConfig,
  type EvaluationResults,
} from './runner.js';

export * from './metrics/retrieval.js';
export * from './metrics/generation.js';

export {
  loadEvaluationDataset,
  loadEvaluationConfig,
  validateEvaluationSample,
  splitDataset,
  type EvaluationSample,
  type EvaluationDataset,
} from './dataset/loader.js';

export {
  generateDataset,
  generateAndSaveDataset,
  type DatasetGeneratorConfig,
  type GeneratedQuery,
} from './dataset/generator.js';

export {
  AblationRunner,
  runAblation,
  type AblationVariantResult,
  type AblationResults,
  type PipelineBuilderFn,
} from './ablation/runner.js';

export {
  generateMarkdownTable,
  generateSummary,
  sortByNDCG,
  sortByDelta,
} from './ablation/reporter.js';

export {
  validateAblationConfig,
  DEFAULT_BASELINE,
  type AblationConfig,
  type AblationVariant,
  type AblationChunking,
  type AblationRetrieval,
  type AblationReranker,
} from './ablation/config.js';

export {
  benchmarkLatency,
  benchmarkComponentLatency,
  calculateLatencyStats,
  type LatencyResult,
  type BenchmarkQueryFn,
} from './benchmarking/latency.js';

export {
  benchmarkThroughput,
  type ThroughputResult,
  type ThroughputConfig,
  type ThroughputQueryFn,
} from './benchmarking/throughput.js';

export {
  calculateEmbeddingCost,
  calculateRerankerCost,
  calculateVectorSearchCost,
  calculateQueryCost,
  CostTracker,
  DEFAULT_PRICING,
  type CostBreakdown,
  type CostPerQuery,
  type PricingConfig,
} from './benchmarking/cost.js';

export {
  generateMarkdownReport,
  saveBenchmarkReport,
  getEnvironmentInfo,
  createBenchmarkReport,
  type BenchmarkReport,
} from './benchmarking/reporter.js';

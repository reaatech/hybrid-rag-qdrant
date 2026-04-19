/**
 * hybrid-rag-qdrant — Library entry point
 */

// Types (domain types, schemas, validation)
export * from './types/index.js';

// Ingestion
export { DocumentLoader, type DocumentLoaderOptions, UnsupportedFormatError, FileSizeExceededError, DocumentParseError } from './ingestion/loader.js';
export { TextPreprocessor, type PreprocessingOptions, type PreprocessingResult } from './ingestion/preprocessor.js';
export { DocumentValidator, type ValidationResult, type DocumentValidatorOptions } from './ingestion/validator.js';

// Chunking
export { ChunkingEngine, type ChunkingResult, chunkDocument } from './chunking/engine.js';
export { FixedSizeChunker } from './chunking/strategies/fixed-size.js';
export { SemanticChunker } from './chunking/strategies/semantic.js';
export { RecursiveChunker } from './chunking/strategies/recursive.js';
export { SlidingWindowChunker } from './chunking/strategies/sliding-window.js';
export { ChunkingBenchmark } from './chunking/benchmark.js';

// Retrieval
export { HybridRetriever, type HybridRetrieverConfig, type HybridRetrievalOptions, HybridRetrievalEngine, type HybridRetrievalConfig, VectorSearchEngine, type VectorSearchConfig, BM25SearchEngine, type BM25SearchConfig, RerankerEngine, type RerankerConfig, type RerankerProvider } from './retrieval/index.js';
export { applyFusion, reciprocalRankFusion, weightedSumFusion, normalizedFusion, type FusionConfig, type FusionStrategyType } from './retrieval/index.js';
export { normalize, minMaxNormalize, zScoreNormalize, rankNormalize, type NormalizationMethod } from './retrieval/index.js';

// Evaluation
export { EvaluationRunner, runEvaluation, type QueryFunction, type EvaluationConfig, type EvaluationResults } from './evaluation/runner.js';
export { loadEvaluationDataset, loadEvaluationConfig, splitDataset, type EvaluationDataset } from './evaluation/dataset/loader.js';
export { generateDataset, generateAndSaveDataset, type DatasetGeneratorConfig, type GeneratedQuery } from './evaluation/dataset/generator.js';
export { AblationRunner, validateAblationConfig, DEFAULT_BASELINE } from './evaluation/ablation/index.js';
export type { AblationVariantResult, AblationResults, PipelineBuilderFn, AblationConfig, AblationVariant } from './evaluation/ablation/index.js';
export type { RetrievalMetrics, QueryEvaluationResult, QueryGenerationResult, GenerationMetrics } from './evaluation/metrics/index.js';

// Benchmarking
export * from './benchmarking/index.js';

// MCP server
export * from './mcp-server/index.js';

// Pipeline (main interface)
export { RAGPipeline, type RAGPipelineConfig, type QueryOptions } from './pipeline.js';

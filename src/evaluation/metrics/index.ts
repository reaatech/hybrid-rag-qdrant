/**
 * Evaluation metrics module exports
 */

export {
  precisionAtK,
  recallAtK,
  dcgAtK,
  idcgAtK,
  ndcgAtK,
  averagePrecision,
  reciprocalRank,
  evaluateQuery,
  aggregateMetrics,
  type QueryEvaluationResult,
  type RetrievalMetrics,
} from './retrieval.js';

export {
  relevanceScore,
  fluencyScore,
  coherenceScore,
  faithfulnessScore,
  answerCorrectnessScore,
  evaluateGeneration,
  aggregateGenerationMetrics,
  type QueryGenerationResult,
  type GenerationMetrics,
} from './generation.js';

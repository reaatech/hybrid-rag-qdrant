/**
 * Evaluation execution runner
 */

import { writeFileSync } from 'fs';
import type { RetrievalResult } from '../types/domain.js';
import type { EvaluationDataset, EvaluationSample } from './dataset/loader.js';
import {
  evaluateQuery,
  aggregateMetrics,
  type RetrievalMetrics,
  type QueryEvaluationResult,
} from './metrics/retrieval.js';

/**
 * Query function type
 */
export type QueryFunction = (
  query: string,
  options?: { topK?: number },
) => Promise<RetrievalResult[]>;

/**
 * Evaluation configuration
 */
export interface EvaluationConfig {
  /** Metrics to calculate */
  metrics?: ('precision' | 'recall' | 'ndcg' | 'map' | 'mrr')[];
  /** Top-K for evaluation */
  topK?: number;
  /** Output path for results */
  outputPath?: string;
}

/**
 * Evaluation results
 */
export interface EvaluationResults {
  metrics: RetrievalMetrics;
  perQueryResults: QueryEvaluationResult[];
  summary: {
    totalQueries: number;
    evaluatedQueries: number;
    timestamp: string;
  };
}

/**
 * Evaluation runner
 */
export class EvaluationRunner {
  private readonly queryFn: QueryFunction;
  private readonly config: Required<EvaluationConfig>;

  constructor(queryFn: QueryFunction, config: EvaluationConfig = {}) {
    this.queryFn = queryFn;
    this.config = {
      metrics: config.metrics ?? ['precision', 'recall', 'ndcg', 'map', 'mrr'],
      topK: config.topK ?? 10,
      outputPath: config.outputPath ?? 'eval-results.json',
    };
  }

  /**
   * Run evaluation on a dataset
   */
  async evaluate(dataset: EvaluationDataset): Promise<EvaluationResults> {
    const queryResults: QueryEvaluationResult[] = [];

    for (const sample of dataset.samples) {
      const result = await this.evaluateSample(sample);
      queryResults.push(result);
    }

    const metrics = aggregateMetrics(queryResults);

    const results: EvaluationResults = {
      metrics,
      perQueryResults: queryResults,
      summary: {
        totalQueries: dataset.samples.length,
        evaluatedQueries: queryResults.length,
        timestamp: new Date().toISOString(),
      },
    };

    // Save results if output path specified
    if (this.config.outputPath) {
      writeFileSync(this.config.outputPath, JSON.stringify(results, null, 2));
    }

    return results;
  }

  /**
   * Evaluate a single sample
   */
  private async evaluateSample(sample: EvaluationSample): Promise<QueryEvaluationResult> {
    // Run retrieval
    const results = await this.queryFn(sample.query, { topK: this.config.topK });

    // Extract retrieved chunk IDs
    const retrievedIds = results.map((r) => r.chunkId);

    // Use relevant chunks for evaluation
    const relevantIds =
      sample.relevantChunks.length > 0 ? sample.relevantChunks : sample.relevantDocs;

    // Calculate metrics
    return evaluateQuery(sample.queryId, retrievedIds, relevantIds, this.config.topK);
  }

  /**
   * Get configuration
   */
  getConfig(): EvaluationConfig {
    return this.config;
  }
}

/**
 * Run evaluation with a simple interface
 */
export async function runEvaluation(
  dataset: EvaluationDataset,
  queryFn: QueryFunction,
  config?: EvaluationConfig,
): Promise<EvaluationResults> {
  const runner = new EvaluationRunner(queryFn, config);
  return runner.evaluate(dataset);
}

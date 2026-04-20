/**
 * Ablation study runner
 */

import { writeFileSync } from 'fs';
import { getLogger } from '../../observability/logger.js';
import type { EvaluationDataset } from '../dataset/loader.js';
import type { RetrievalMetrics } from '../metrics/retrieval.js';
import { EvaluationRunner, type QueryFunction } from '../runner.js';
import type { AblationConfig, AblationVariant } from './config.js';

const logger = getLogger();

/**
 * Result for a single ablation variant
 */
export interface AblationVariantResult {
  variant: AblationVariant;
  metrics: RetrievalMetrics;
  delta: {
    precisionAtK: number;
    recallAtK: number;
    ndcgAtK: number;
    map: number;
    mrr: number;
  };
  executionTime: number;
}

/**
 * Ablation study results
 */
export interface AblationResults {
  baseline: {
    config: AblationConfig['baseline'];
    metrics: RetrievalMetrics;
  };
  variants: AblationVariantResult[];
  summary: {
    totalVariants: number;
    timestamp: string;
  };
}

/**
 * Pipeline builder function type
 */
export type PipelineBuilderFn = (config: {
  chunking: string;
  chunkSize: number;
  overlap: number;
  retrieval: string;
  vectorWeight: number;
  bm25Weight: number;
  reranker: string | null;
  topK: number;
}) => Promise<{
  query: QueryFunction;
  cleanup: () => Promise<void>;
}>;

/**
 * Ablation study runner
 */
export class AblationRunner {
  private readonly config: AblationConfig;
  private readonly pipelineBuilder: PipelineBuilderFn;

  constructor(config: AblationConfig, pipelineBuilder: PipelineBuilderFn) {
    this.config = config;
    this.pipelineBuilder = pipelineBuilder;
  }

  /**
   * Run ablation study
   */
  async run(dataset: EvaluationDataset, outputPath?: string): Promise<AblationResults> {
    const results: AblationVariantResult[] = [];

    // Run baseline
    logger.info('Running baseline configuration...');
    const baselinePipeline = await this.pipelineBuilder(this.config.baseline);
    let baselineMetrics: RetrievalMetrics;
    try {
      const baselineRunner = new EvaluationRunner(baselinePipeline.query, {
        topK: this.config.baseline.topK,
      });
      baselineMetrics = (await baselineRunner.evaluate(dataset)).metrics;
    } finally {
      await baselinePipeline.cleanup();
    }

    // Run each variant
    for (const variant of this.config.variants) {
      logger.info(`Running variant: ${variant.name}...`);
      const startTime = Date.now();

      // Merge baseline with variant changes
      const variantConfig = {
        ...this.config.baseline,
        ...variant.changes,
      };

      // Build and run pipeline
      const variantPipeline = await this.pipelineBuilder(variantConfig);
      let variantMetrics: RetrievalMetrics;
      try {
        const runner = new EvaluationRunner(variantPipeline.query, { topK: variantConfig.topK });
        variantMetrics = (await runner.evaluate(dataset)).metrics;
      } finally {
        await variantPipeline.cleanup();
      }

      const executionTime = Date.now() - startTime;

      // Calculate deltas
      const delta = {
        precisionAtK: variantMetrics.precisionAtK - baselineMetrics.precisionAtK,
        recallAtK: variantMetrics.recallAtK - baselineMetrics.recallAtK,
        ndcgAtK: variantMetrics.ndcgAtK - baselineMetrics.ndcgAtK,
        map: variantMetrics.map - baselineMetrics.map,
        mrr: variantMetrics.mrr - baselineMetrics.mrr,
      };

      results.push({
        variant,
        metrics: variantMetrics,
        delta,
        executionTime,
      });
    }

    const ablationResults: AblationResults = {
      baseline: {
        config: this.config.baseline,
        metrics: baselineMetrics,
      },
      variants: results,
      summary: {
        totalVariants: results.length,
        timestamp: new Date().toISOString(),
      },
    };

    // Save results if output path specified
    if (outputPath) {
      writeFileSync(outputPath, JSON.stringify(ablationResults, null, 2));
    }

    return ablationResults;
  }
}

/**
 * Run ablation study with a simple interface
 */
export async function runAblation(
  config: AblationConfig,
  dataset: EvaluationDataset,
  pipelineBuilder: PipelineBuilderFn,
  outputPath?: string,
): Promise<AblationResults> {
  const runner = new AblationRunner(config, pipelineBuilder);
  return runner.run(dataset, outputPath);
}

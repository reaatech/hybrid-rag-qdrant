/**
 * Evaluate Command
 */

import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { EvaluationRunner } from '@reaatech/hybrid-rag-evaluation';
import { aggregateMetrics } from '@reaatech/hybrid-rag-evaluation';
import { type EvaluationDataset, loadEvaluationDataset } from '@reaatech/hybrid-rag-evaluation';
import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

export interface EvaluateOptions {
  output: string;
  metrics: string;
  qdrantUrl: string;
  collection: string;
}

export async function evaluateCommand(
  datasetPath: string,
  options: EvaluateOptions,
  pipeline: RAGPipeline,
): Promise<void> {
  console.log(`Running evaluation on dataset: ${datasetPath}`);

  const evalDataset = loadEvaluationDataset(datasetPath);

  console.log(`Loaded ${evalDataset.samples.length} test queries.`);

  console.log('Running evaluation...');
  const runner = new EvaluationRunner(pipeline.query.bind(pipeline), { topK: 10 });
  const results = await runner.evaluate(evalDataset);

  const output = {
    dataset: datasetPath,
    total_queries: results.summary.totalQueries,
    evaluated_queries: results.summary.evaluatedQueries,
    metrics: {
      precision_at_10: results.metrics.precisionAtK,
      recall_at_10: results.metrics.recallAtK,
      ndcg_at_10: results.metrics.ndcgAtK,
      map: results.metrics.map,
      mrr: results.metrics.mrr,
    },
    timestamp: results.summary.timestamp,
  };

  await writeFile(options.output, JSON.stringify(output, null, 2));

  console.log('\nEvaluation Results:');
  console.log(`  Precision@10: ${results.metrics.precisionAtK.toFixed(4)}`);
  console.log(`  Recall@10: ${results.metrics.recallAtK.toFixed(4)}`);
  console.log(`  NDCG@10: ${results.metrics.ndcgAtK.toFixed(4)}`);
  console.log(`  MAP: ${results.metrics.map.toFixed(4)}`);
  console.log(`  MRR: ${results.metrics.mrr.toFixed(4)}`);
  console.log(`\nResults saved to: ${options.output}`);
}

/**
 * Ablate Command
 */

import { readFile } from 'fs/promises';
import { writeFile } from 'fs/promises';
import { load } from 'js-yaml';
import type { RAGPipeline } from '../../pipeline.js';
import { AblationRunner, type AblationConfig } from '../../evaluation/ablation/index.js';
import { loadEvaluationDataset, type EvaluationDataset } from '../../evaluation/dataset/loader.js';

export interface AblateOptions {
  output: string;
  qdrantUrl: string;
  collection: string;
}

export async function ablateCommand(configPath: string, datasetPath: string, options: AblateOptions, pipeline: RAGPipeline): Promise<void> {
  console.log(`Running ablation study...`);
  console.log(`  Config: ${configPath}`);
  console.log(`  Dataset: ${datasetPath}`);

  const configContent = await readFile(configPath, 'utf-8');
  const config = load(configContent) as { baseline: AblationConfig['baseline']; variants: AblationConfig['variants'] };

  const evalDataset = loadEvaluationDataset(datasetPath);

  console.log(`  Configurations: ${config.variants.length}`);
  console.log(`  Test queries: ${evalDataset.samples.length}`);

  const pipelineBuilder = async () => {
    return {
      query: async (q: string) => {
        console.log(`  [Ablation] Query: ${q.substring(0, 50)}...`);
        try {
          return await pipeline.query(q, { topK: 10 });
        } catch (error) {
          console.error(`  [Ablation] Query failed:`, error);
          return [];
        }
      },
      cleanup: async () => {},
    };
  };

  const ablation = new AblationRunner(config, pipelineBuilder);
  const results = await ablation.run(evalDataset, options.output);

  console.log(`\nAblation Study Results:`);
  for (const r of results.variants) {
    console.log(`  ${r.variant.name}:`);
    console.log(`    Precision@10: ${r.metrics.precisionAtK.toFixed(4)}`);
    console.log(`    Recall@10: ${r.metrics.recallAtK.toFixed(4)}`);
    console.log(`    NDCG@10: ${r.metrics.ndcgAtK.toFixed(4)}`);
  }

  console.log(`\nResults saved to: ${options.output}`);
}
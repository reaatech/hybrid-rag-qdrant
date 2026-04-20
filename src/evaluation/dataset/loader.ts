/**
 * Evaluation dataset loading
 */

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

/**
 * Evaluation sample (ground truth)
 */
export interface EvaluationSample {
  queryId: string;
  query: string;
  relevantDocs: string[];
  relevantChunks: string[];
  idealAnswer?: string;
}

/**
 * Evaluation dataset
 */
export interface EvaluationDataset {
  samples: EvaluationSample[];
  metadata: {
    name?: string;
    description?: string;
    createdAt?: string;
    totalSamples: number;
  };
}

/**
 * Load evaluation dataset from JSONL file
 */
export function loadEvaluationDataset(path: string): EvaluationDataset {
  const content = readFileSync(path, 'utf-8');
  const lines = content.trim().split('\n');
  const samples: EvaluationSample[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const parsed = JSON.parse(line);
    samples.push({
      queryId: parsed.query_id,
      query: parsed.query,
      relevantDocs: parsed.relevant_docs ?? [],
      relevantChunks: parsed.relevant_chunks ?? [],
      idealAnswer: parsed.ideal_answer,
    });
  }

  return {
    samples,
    metadata: {
      totalSamples: samples.length,
    },
  };
}

/**
 * Load evaluation config from YAML file
 */
export function loadEvaluationConfig<T = Record<string, unknown>>(path: string): T {
  const content = readFileSync(path, 'utf-8');
  return parseYaml(content) as T;
}

/**
 * Validate evaluation sample
 */
export function validateEvaluationSample(sample: EvaluationSample): boolean {
  return (
    typeof sample.queryId === 'string' &&
    sample.queryId.length > 0 &&
    typeof sample.query === 'string' &&
    sample.query.length > 0 &&
    Array.isArray(sample.relevantDocs) &&
    Array.isArray(sample.relevantChunks) &&
    (sample.relevantDocs.length > 0 || sample.relevantChunks.length > 0)
  );
}

/**
 * Split dataset into train/test
 */
export function splitDataset(
  dataset: EvaluationDataset,
  testRatio: number = 0.2,
  seed: number = 42,
): { train: EvaluationDataset; test: EvaluationDataset } {
  // Simple deterministic split
  const shuffled = [...dataset.samples].sort((a, b) => {
    const hashA = hashCode(a.queryId + seed);
    const hashB = hashCode(b.queryId + seed);
    return hashA - hashB;
  });

  const splitIndex = Math.floor(shuffled.length * (1 - testRatio));

  return {
    train: {
      samples: shuffled.slice(0, splitIndex),
      metadata: {
        ...dataset.metadata,
        totalSamples: splitIndex,
      },
    },
    test: {
      samples: shuffled.slice(splitIndex),
      metadata: {
        ...dataset.metadata,
        totalSamples: shuffled.length - splitIndex,
      },
    },
  };
}

/**
 * Simple hash function for deterministic splitting
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

import { describe, expect, it } from 'vitest';
import type { RetrievalMetrics } from '../metrics/retrieval.js';
import { generateMarkdownTable, generateSummary, sortByDelta, sortByNDCG } from './reporter.js';
import type { AblationResults, AblationVariantResult } from './runner.js';

function metrics(ndcg: number): RetrievalMetrics {
  return {
    precisionAtK: 0.5,
    recallAtK: 0.6,
    ndcgAtK: ndcg,
    map: 0.4,
    mrr: 0.7,
    queryResults: [],
  };
}

function variant(name: string, ndcg: number, delta: number): AblationVariantResult {
  return {
    variant: { name, changes: {} },
    metrics: metrics(ndcg),
    delta: { precisionAtK: 0, recallAtK: 0, ndcgAtK: delta, map: 0, mrr: 0 },
    executionTime: 10,
  };
}

function makeResults(variants: AblationVariantResult[]): AblationResults {
  return {
    baseline: {
      config: {
        chunking: 'fixed-size',
        chunkSize: 512,
        overlap: 50,
        retrieval: 'hybrid',
        vectorWeight: 0.7,
        bm25Weight: 0.3,
        reranker: 'cohere',
        topK: 10,
      },
      metrics: metrics(0.5),
    },
    variants,
    summary: { totalVariants: variants.length, timestamp: '2026-01-01T00:00:00Z' },
  };
}

describe('generateMarkdownTable', () => {
  it('renders baseline and variants with delta formatting', () => {
    const results = makeResults([variant('better', 0.7, 0.2), variant('worse', 0.3, -0.2)]);
    const table = generateMarkdownTable(results);
    expect(table).toContain('**Baseline**');
    expect(table).toContain('better');
    expect(table).toContain('+0.2000');
    expect(table).toContain('-0.2000');
  });
});

describe('generateSummary', () => {
  it('includes best and worst variants', () => {
    const results = makeResults([variant('best', 0.9, 0.4), variant('mid', 0.6, 0.1)]);
    const summary = generateSummary(results);
    expect(summary).toContain('# Ablation Study Results');
    expect(summary).toContain('Best performing variant:** best');
    expect(summary).toContain('Worst performing variant:** mid');
    expect(summary).toContain('Reranker: cohere');
  });

  it('renders reranker none when reranker is null', () => {
    const results = makeResults([variant('only', 0.5, 0)]);
    results.baseline.config.reranker = null;
    const summary = generateSummary(results);
    expect(summary).toContain('Reranker: none');
  });

  it('omits findings when there are no variants', () => {
    const results = makeResults([]);
    const summary = generateSummary(results);
    expect(summary).toContain('Key Findings');
    expect(summary).not.toContain('Best performing variant');
  });
});

describe('sorting helpers', () => {
  it('sortByNDCG sorts descending by ndcg', () => {
    const sorted = sortByNDCG([variant('a', 0.3, 0), variant('b', 0.9, 0)]);
    expect(sorted.map((v) => v.variant.name)).toEqual(['b', 'a']);
  });

  it('sortByDelta sorts descending by delta', () => {
    const sorted = sortByDelta([variant('a', 0.3, -0.1), variant('b', 0.9, 0.5)]);
    expect(sorted.map((v) => v.variant.name)).toEqual(['b', 'a']);
  });
});

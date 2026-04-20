import { describe, it, expect } from 'vitest';
import {
  validateAblationConfig,
  DEFAULT_BASELINE,
  type AblationConfig,
} from '../../src/evaluation/ablation/config.js';
import {
  generateMarkdownTable,
  generateSummary,
  sortByNDCG,
  sortByDelta,
} from '../../src/evaluation/ablation/reporter.js';
import type {
  AblationResults,
  AblationVariantResult,
} from '../../src/evaluation/ablation/runner.js';

describe('ablation studies', () => {
  describe('ablation config', () => {
    it('should validate a proper ablation configuration', () => {
      const config: AblationConfig = {
        baseline: {
          chunking: 'fixed-size',
          chunkSize: 512,
          overlap: 50,
          retrieval: 'hybrid',
          vectorWeight: 0.7,
          bm25Weight: 0.3,
          topK: 10,
          reranker: 'cohere',
        },
        variants: [
          {
            name: 'no-reranker',
            changes: { reranker: null },
          },
        ],
      };

      const result = validateAblationConfig(config);

      expect(result).toBe(true);
    });

    it('should reject config with missing fields', () => {
      const config = {
        baseline: {
          chunking: 'fixed-size',
          chunkSize: 512,
        },
        variants: [],
      };

      const result = validateAblationConfig(config as AblationConfig);

      expect(result).toBe(false);
    });

    it('should reject config with weights not summing to 1', () => {
      const config: AblationConfig = {
        baseline: {
          chunking: 'fixed-size',
          chunkSize: 512,
          overlap: 50,
          retrieval: 'hybrid',
          vectorWeight: 0.5,
          bm25Weight: 0.3,
          topK: 10,
          reranker: null,
        },
        variants: [],
      };

      const result = validateAblationConfig(config);

      expect(result).toBe(false);
    });

    it('should have default baseline values', () => {
      expect(DEFAULT_BASELINE.chunking).toBe('fixed-size');
      expect(DEFAULT_BASELINE.chunkSize).toBe(512);
      expect(DEFAULT_BASELINE.overlap).toBe(50);
      expect(DEFAULT_BASELINE.retrieval).toBe('hybrid');
      expect(DEFAULT_BASELINE.vectorWeight).toBe(0.7);
      expect(DEFAULT_BASELINE.bm25Weight).toBe(0.3);
      expect(DEFAULT_BASELINE.topK).toBe(10);
    });
  });

  describe('ablation reporter', () => {
    it('should generate markdown table', () => {
      const mockResults: AblationResults = {
        baseline: {
          config: DEFAULT_BASELINE,
          metrics: {
            precisionAtK: 0.78,
            recallAtK: 0.65,
            ndcgAtK: 0.72,
            map: 0.71,
            mrr: 0.68,
            queryResults: [],
          },
        },
        variants: [
          {
            variant: { name: 'no-reranker', changes: { reranker: null } },
            metrics: {
              precisionAtK: 0.68,
              recallAtK: 0.55,
              ndcgAtK: 0.62,
              map: 0.61,
              mrr: 0.58,
              queryResults: [],
            },
            delta: {
              precisionAtK: -0.1,
              recallAtK: -0.1,
              ndcgAtK: -0.1,
              map: -0.1,
              mrr: -0.1,
            },
            executionTime: 1000,
          },
        ],
        summary: {
          totalVariants: 1,
          timestamp: new Date().toISOString(),
        },
      };

      const table = generateMarkdownTable(mockResults);

      expect(table).toContain('Baseline');
      expect(table).toContain('no-reranker');
      expect(table).toContain('|');
      expect(table).toContain('NDCG');
    });

    it('should generate summary', () => {
      const mockResults: AblationResults = {
        baseline: {
          config: DEFAULT_BASELINE,
          metrics: {
            precisionAtK: 0.78,
            recallAtK: 0.65,
            ndcgAtK: 0.72,
            map: 0.71,
            mrr: 0.68,
            queryResults: [],
          },
        },
        variants: [
          {
            variant: { name: 'variant-1', changes: { reranker: null } },
            metrics: {
              precisionAtK: 0.68,
              recallAtK: 0.55,
              ndcgAtK: 0.62,
              map: 0.61,
              mrr: 0.58,
              queryResults: [],
            },
            delta: {
              precisionAtK: -0.1,
              recallAtK: -0.1,
              ndcgAtK: -0.1,
              map: -0.1,
              mrr: -0.1,
            },
            executionTime: 1000,
          },
        ],
        summary: {
          totalVariants: 1,
          timestamp: new Date().toISOString(),
        },
      };

      const summary = generateSummary(mockResults);

      expect(summary).toContain('Ablation Study Results');
      expect(summary).toContain('variant-1');
      expect(summary).toContain('Baseline Configuration');
    });

    it('should sort variants by NDCG', () => {
      const variants: AblationVariantResult[] = [
        {
          variant: { name: 'low', changes: {} },
          metrics: {
            precisionAtK: 0.5,
            recallAtK: 0.5,
            ndcgAtK: 0.5,
            map: 0.5,
            mrr: 0.5,
            queryResults: [],
          },
          delta: { precisionAtK: 0, recallAtK: 0, ndcgAtK: 0, map: 0, mrr: 0 },
          executionTime: 100,
        },
        {
          variant: { name: 'high', changes: {} },
          metrics: {
            precisionAtK: 0.8,
            recallAtK: 0.8,
            ndcgAtK: 0.8,
            map: 0.8,
            mrr: 0.8,
            queryResults: [],
          },
          delta: { precisionAtK: 0, recallAtK: 0, ndcgAtK: 0, map: 0, mrr: 0 },
          executionTime: 100,
        },
        {
          variant: { name: 'medium', changes: {} },
          metrics: {
            precisionAtK: 0.6,
            recallAtK: 0.6,
            ndcgAtK: 0.6,
            map: 0.6,
            mrr: 0.6,
            queryResults: [],
          },
          delta: { precisionAtK: 0, recallAtK: 0, ndcgAtK: 0, map: 0, mrr: 0 },
          executionTime: 100,
        },
      ];

      const sorted = sortByNDCG(variants);

      expect(sorted[0].variant.name).toBe('high');
      expect(sorted[1].variant.name).toBe('medium');
      expect(sorted[2].variant.name).toBe('low');
    });

    it('should sort variants by delta', () => {
      const variants: AblationVariantResult[] = [
        {
          variant: { name: 'negative', changes: {} },
          metrics: {
            precisionAtK: 0.5,
            recallAtK: 0.5,
            ndcgAtK: 0.5,
            map: 0.5,
            mrr: 0.5,
            queryResults: [],
          },
          delta: { precisionAtK: -0.1, recallAtK: -0.1, ndcgAtK: -0.2, map: -0.1, mrr: -0.1 },
          executionTime: 100,
        },
        {
          variant: { name: 'positive', changes: {} },
          metrics: {
            precisionAtK: 0.8,
            recallAtK: 0.8,
            ndcgAtK: 0.8,
            map: 0.8,
            mrr: 0.8,
            queryResults: [],
          },
          delta: { precisionAtK: 0.1, recallAtK: 0.1, ndcgAtK: 0.1, map: 0.1, mrr: 0.1 },
          executionTime: 100,
        },
      ];

      const sorted = sortByDelta(variants);

      expect(sorted[0].variant.name).toBe('positive');
      expect(sorted[1].variant.name).toBe('negative');
    });
  });
});

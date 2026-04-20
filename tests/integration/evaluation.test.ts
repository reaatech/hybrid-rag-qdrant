import { describe, it, expect, vi } from 'vitest';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('evaluation integration', () => {
  describe('evaluation runner', () => {
    it('should run evaluation on a dataset', async () => {
      const { EvaluationRunner } = await import('../../src/evaluation/runner.js');

      // Mock query function
      const mockQuery = vi.fn().mockResolvedValue([
        { id: 'chunk-001-3', score: 0.9 },
        { id: 'chunk-002-1', score: 0.8 },
        { id: 'chunk-003-2', score: 0.7 },
      ]);

      const runner = new EvaluationRunner(mockQuery, {
        metrics: ['precision@10', 'recall@10', 'ndcg@10', 'map', 'mrr'],
      });

      const dataset = {
        samples: [
          {
            queryId: 'q1',
            query: 'How do I reset my password?',
            relevantDocs: [],
            relevantChunks: ['chunk-001-3'],
          },
          {
            queryId: 'q2',
            query: 'What is the refund policy?',
            relevantDocs: [],
            relevantChunks: ['chunk-002-1'],
          },
        ],
      };

      const results = await runner.evaluate(dataset);

      expect(results).toBeDefined();
      expect(results.metrics).toBeDefined();
      expect(results.perQueryResults).toHaveLength(2);
    });

    it('should calculate all requested metrics', async () => {
      const { EvaluationRunner } = await import('../../src/evaluation/runner.js');

      const mockQuery = vi.fn().mockResolvedValue([
        { id: 'relevant-1', score: 0.9 },
        { id: 'irrelevant-1', score: 0.5 },
      ]);

      const runner = new EvaluationRunner(mockQuery, {
        metrics: ['precision', 'recall', 'ndcg'],
      });

      const dataset = {
        samples: [
          {
            queryId: 'q1',
            query: 'test',
            relevantDocs: [],
            relevantChunks: ['relevant-1'],
          },
        ],
      };

      const results = await runner.evaluate(dataset);

      expect(results.metrics).toHaveProperty('precisionAtK');
      expect(results.metrics).toHaveProperty('recallAtK');
      expect(results.metrics).toHaveProperty('ndcgAtK');
    });
  });

  describe('dataset loading', () => {
    it('should load JSONL evaluation dataset', async () => {
      const { loadEvaluationDataset } = await import('../../src/evaluation/dataset/loader.js');

      const tempPath = join(tmpdir(), `eval-${Date.now()}.jsonl`);
      const content = [
        JSON.stringify({ query_id: 'q1', query: 'test query 1', relevant_docs: ['doc-1'] }),
        JSON.stringify({ query_id: 'q2', query: 'test query 2', relevant_docs: ['doc-2'] }),
      ].join('\n');

      await writeFile(tempPath, content);

      const dataset = await loadEvaluationDataset(tempPath);

      expect(dataset.samples).toHaveLength(2);
      expect(dataset.samples[0].queryId).toBe('q1');
      expect(dataset.samples[1].queryId).toBe('q2');
    });

    it('should load evaluation config', async () => {
      const { loadEvaluationConfig } = await import('../../src/evaluation/dataset/loader.js');

      const tempPath = join(tmpdir(), `config-${Date.now()}.yaml`);
      const config = `
metrics:
  - precision@10
  - recall@10
  - ndcg@10
topK: 10
`;

      await writeFile(tempPath, config);

      const loaded = await loadEvaluationConfig(tempPath);

      expect(loaded).toBeDefined();
      expect(loaded.metrics).toContain('precision@10');
      expect(loaded.topK).toBe(10);
    });

    it('should validate evaluation samples', async () => {
      const { validateEvaluationSample } = await import('../../src/evaluation/dataset/loader.js');

      const validSample = {
        queryId: 'q1',
        query: 'test query',
        relevantDocs: [],
        relevantChunks: ['doc-1'],
      };

      const result = validateEvaluationSample(validSample);

      expect(result).toBe(true);
    });

    it('should split dataset into train/test', async () => {
      const { splitDataset } = await import('../../src/evaluation/dataset/loader.js');

      const dataset = {
        samples: [
          { queryId: 'q1', query: 'test 1', relevantDocs: [], relevantChunks: ['doc-1'] },
          { queryId: 'q2', query: 'test 2', relevantDocs: [], relevantChunks: ['doc-2'] },
          { queryId: 'q3', query: 'test 3', relevantDocs: [], relevantChunks: ['doc-3'] },
          { queryId: 'q4', query: 'test 4', relevantDocs: [], relevantChunks: ['doc-4'] },
        ],
      };

      const { train, test } = splitDataset(dataset, 0.5);

      expect(train.samples).toHaveLength(2);
      expect(test.samples).toHaveLength(2);
    });
  });

  describe('generation metrics integration', () => {
    it('should evaluate generation quality', async () => {
      const { evaluateGeneration } = await import('../../src/evaluation/metrics/generation.js');

      const result = evaluateGeneration(
        'q1',
        'What is machine learning?',
        'Machine learning is a subset of AI that uses algorithms to learn from data.',
        ['Machine learning is a field of AI.', 'It uses statistical methods.'],
        'Machine learning is a subset of artificial intelligence.',
      );

      expect(result.queryId).toBe('q1');
      expect(result.relevance).toBeGreaterThan(0);
      expect(result.fluency).toBeGreaterThan(0);
      expect(result.coherence).toBeGreaterThan(0);
      expect(result.faithfulness).toBeGreaterThan(0);
      expect(result.answerCorrectness).toBeGreaterThan(0);
    });

    it('should aggregate generation metrics', async () => {
      const { aggregateGenerationMetrics } =
        await import('../../src/evaluation/metrics/generation.js');

      const results = [
        { queryId: 'q1', relevance: 0.8, fluency: 0.9, coherence: 0.7, faithfulness: 0.6 },
        { queryId: 'q2', relevance: 0.6, fluency: 0.7, coherence: 0.8, faithfulness: 0.5 },
      ];

      const aggregated = aggregateGenerationMetrics(results);

      expect(aggregated.avgRelevance).toBe(0.7);
      expect(aggregated.avgFluency).toBe(0.8);
      expect(aggregated.avgCoherence).toBe(0.75);
      expect(aggregated.avgFaithfulness).toBe(0.55);
    });
  });
});

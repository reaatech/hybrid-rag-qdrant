import { describe, it, expect } from 'vitest';
import {
  precisionAtK,
  recallAtK,
  ndcgAtK,
  averagePrecision,
  reciprocalRank,
  evaluateQuery,
  aggregateMetrics,
  relevanceScore,
  fluencyScore,
  coherenceScore,
  faithfulnessScore,
  answerCorrectnessScore,
  evaluateGeneration,
  aggregateGenerationMetrics,
} from '../../src/evaluation/metrics/index.js';

describe('Retrieval Metrics', () => {
  describe('Precision@K', () => {
    it('should calculate precision correctly', () => {
      const retrieved = ['c1', 'c2', 'c3'];
      const relevant = ['c1', 'c3', 'c5', 'c7'];

      const p = precisionAtK(retrieved, relevant, 3);

      expect(p).toBeCloseTo(2 / 3, 2);
    });

    it('should return 0 when no results are relevant', () => {
      const retrieved = ['c1', 'c2', 'c3'];
      const relevant = ['c5', 'c6', 'c7'];

      const p = precisionAtK(retrieved, relevant, 3);

      expect(p).toBe(0);
    });

    it('should handle k larger than results', () => {
      const retrieved = ['c1'];
      const relevant = ['c1', 'c2'];

      const p = precisionAtK(retrieved, relevant, 10);

      expect(p).toBe(1);
    });
  });

  describe('Recall@K', () => {
    it('should calculate recall correctly', () => {
      const retrieved = ['c1', 'c2'];
      const relevant = ['c1', 'c3', 'c5', 'c7'];

      const r = recallAtK(retrieved, relevant, 10);

      expect(r).toBe(0.25);
    });

    it('should return 1 when all relevant are retrieved', () => {
      const retrieved = ['c1', 'c2'];
      const relevant = ['c1', 'c2'];

      const r = recallAtK(retrieved, relevant, 5);

      expect(r).toBe(1);
    });

    it('should return 0 when no relevant retrieved', () => {
      const retrieved = ['c1'];
      const relevant = ['c5', 'c6'];

      const r = recallAtK(retrieved, relevant, 5);

      expect(r).toBe(0);
    });
  });

  describe('Average Precision', () => {
    it('should calculate MAP for single query', () => {
      const retrieved = ['c1', 'c2', 'c3'];
      const relevant = ['c1', 'c3'];

      const ap = averagePrecision(retrieved, relevant, 3);

      expect(ap).toBeCloseTo(0.833, 2);
    });

    it('should return 0 when no relevant retrieved', () => {
      const retrieved = ['c1', 'c2'];
      const relevant = ['c5', 'c6'];

      const ap = averagePrecision(retrieved, relevant, 10);

      expect(ap).toBe(0);
    });
  });

  describe('Reciprocal Rank', () => {
    it('should calculate MRR correctly', () => {
      const retrieved = ['c1', 'c2', 'c3'];
      const relevant = ['c2', 'c3'];

      const rr = reciprocalRank(retrieved, relevant);

      expect(rr).toBe(0.5);
    });

    it('should return 1 when first result is relevant', () => {
      const retrieved = ['c1', 'c2', 'c3'];
      const relevant = ['c1'];

      const rr = reciprocalRank(retrieved, relevant);

      expect(rr).toBe(1);
    });

    it('should return 0 when no relevant results', () => {
      const retrieved = ['c1', 'c2', 'c3'];
      const relevant = ['c99'];

      const rr = reciprocalRank(retrieved, relevant);

      expect(rr).toBe(0);
    });
  });

  describe('NDCG', () => {
    it('should calculate NDCG correctly', () => {
      const retrieved = ['c1', 'c2', 'c3'];
      const relevant = ['c1', 'c3'];

      const ndcgScore = ndcgAtK(retrieved, relevant, 3);

      expect(ndcgScore).toBeGreaterThan(0);
      expect(ndcgScore).toBeLessThanOrEqual(1);
    });

    it('should return 1 for perfect ranking', () => {
      const retrieved = ['c1', 'c2'];
      const relevant = ['c1', 'c2'];

      const ndcgScore = ndcgAtK(retrieved, relevant, 2);

      expect(ndcgScore).toBe(1);
    });

    it('should handle empty results', () => {
      const ndcgScore = ndcgAtK([], [], 10);

      expect(ndcgScore).toBe(0);
    });
  });

  describe('evaluateQuery', () => {
    it('should evaluate a single query', () => {
      const retrieved = ['c1', 'c2', 'c3'];
      const relevant = ['c1', 'c3'];

      const result = evaluateQuery('q1', retrieved, relevant, 3);

      expect(result.queryId).toBe('q1');
      expect(result.precision).toBeGreaterThan(0);
      expect(result.recall).toBeGreaterThan(0);
      expect(result.ndcg).toBeGreaterThan(0);
      expect(result.averagePrecision).toBeGreaterThan(0);
      expect(result.reciprocalRank).toBe(1);
    });
  });

  describe('aggregateMetrics', () => {
    it('should aggregate metrics across queries', () => {
      const queryResults = [
        {
          queryId: 'q1',
          precision: 1,
          recall: 0.5,
          ndcg: 0.9,
          averagePrecision: 0.8,
          reciprocalRank: 1,
        },
        {
          queryId: 'q2',
          precision: 0.5,
          recall: 0.25,
          ndcg: 0.45,
          averagePrecision: 0.4,
          reciprocalRank: 0.5,
        },
      ];

      const metrics = aggregateMetrics(queryResults);

      expect(metrics.precisionAtK).toBe(0.75);
      expect(metrics.recallAtK).toBe(0.375);
      expect(metrics.queryResults).toHaveLength(2);
    });

    it('should handle empty input', () => {
      const metrics = aggregateMetrics([]);

      expect(metrics.precisionAtK).toBe(0);
      expect(metrics.recallAtK).toBe(0);
      expect(metrics.ndcgAtK).toBe(0);
      expect(metrics.map).toBe(0);
      expect(metrics.mrr).toBe(0);
    });
  });
});

describe('generation metrics', () => {
  describe('relevanceScore', () => {
    it('returns 0 for empty query', () => {
      const score = relevanceScore('', 'Hello world');
      expect(score).toBe(0);
    });

    it('returns 1 when all query words are in answer', () => {
      const score = relevanceScore('Hello world testing', 'Hello world testing framework');
      expect(score).toBe(1);
    });

    it('returns partial score for partial match', () => {
      const score = relevanceScore('Hello world testing', 'Hello world');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('returns 0 when no words match', () => {
      const score = relevanceScore('apple banana cherry', 'dog cat bird');
      expect(score).toBe(0);
    });
  });

  describe('fluencyScore', () => {
    it('returns 0 for empty text', () => {
      const score = fluencyScore('');
      expect(score).toBe(0);
    });

    it('returns higher score for well-formatted text', () => {
      const score = fluencyScore('Hello world. This is a well-formed sentence.');
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('coherenceScore', () => {
    it('returns 1 for single sentence', () => {
      const score = coherenceScore('Hello world.');
      expect(score).toBe(1);
    });

    it('returns higher score with transition words', () => {
      const withoutTransition = 'It is raining. The streets are wet.';
      const withTransition = 'It is raining. Therefore, the streets are wet.';

      const scoreWithout = coherenceScore(withoutTransition);
      const scoreWith = coherenceScore(withTransition);

      expect(scoreWith).toBeGreaterThanOrEqual(scoreWithout);
    });
  });

  describe('faithfulnessScore', () => {
    it('returns 0 for empty source chunks', () => {
      const score = faithfulnessScore('Answer text', []);
      expect(score).toBe(0);
    });

    it('returns 1 when answer is fully contained in source', () => {
      const answer = 'The capital of France is Paris.';
      const source = ['The capital of France is Paris.'];

      const score = faithfulnessScore(answer, source);
      expect(score).toBe(1);
    });

    it('returns partial score for partial overlap', () => {
      const answer = 'The capital is Madrid.';
      const source = ['The capital of France is Paris.'];

      const score = faithfulnessScore(answer, source);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });

  describe('answerCorrectnessScore', () => {
    it('returns 0 for empty ground truth', () => {
      const score = answerCorrectnessScore('Paris is the capital.', '');
      expect(score).toBe(0);
    });

    it('returns 1 for exact match', () => {
      const score = answerCorrectnessScore('Paris is the capital.', 'Paris is the capital.');
      expect(score).toBe(1);
    });

    it('returns partial score for partial match', () => {
      const score = answerCorrectnessScore(
        'Paris is capital of France',
        'The capital of France is Paris',
      );
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('evaluateGeneration', () => {
    it('evaluates all metrics for a query', () => {
      const result = evaluateGeneration(
        'q1',
        'What is the capital of France?',
        'Paris is the capital of France.',
        ['The capital of France is Paris.'],
      );

      expect(result.queryId).toBe('q1');
      expect(result.relevance).toBeGreaterThan(0);
      expect(result.fluency).toBeGreaterThan(0);
      expect(result.coherence).toBeGreaterThan(0);
      expect(result.faithfulness).toBeGreaterThan(0);
    });

    it('omits answerCorrectness when ground truth not provided', () => {
      const result = evaluateGeneration(
        'q1',
        'What is the capital of France?',
        'Paris is the capital.',
        ['The capital of France is Paris.'],
      );

      expect(result.answerCorrectness).toBeUndefined();
    });

    it('includes answerCorrectness when ground truth is provided', () => {
      const result = evaluateGeneration(
        'q1',
        'What is the capital of France?',
        'Paris is the capital of France.',
        ['The capital of France is Paris.'],
        'Paris is the capital of France.',
      );

      expect(result.answerCorrectness).toBeDefined();
      expect(result.answerCorrectness).toBe(1);
    });
  });

  describe('aggregateGenerationMetrics', () => {
    it('returns zeros for empty input', () => {
      const metrics = aggregateGenerationMetrics([]);

      expect(metrics.avgRelevance).toBe(0);
      expect(metrics.avgFluency).toBe(0);
      expect(metrics.avgCoherence).toBe(0);
      expect(metrics.avgFaithfulness).toBe(0);
    });

    it('aggregates metrics correctly', () => {
      const queryResults = [
        {
          queryId: 'q1',
          relevance: 1,
          fluency: 0.8,
          coherence: 0.9,
          faithfulness: 1,
        },
        {
          queryId: 'q2',
          relevance: 0.5,
          fluency: 0.6,
          coherence: 0.7,
          faithfulness: 0.5,
        },
      ];

      const metrics = aggregateGenerationMetrics(queryResults);

      expect(metrics.avgRelevance).toBe(0.75);
      expect(metrics.avgFluency).toBe(0.7);
      expect(metrics.avgCoherence).toBe(0.8);
      expect(metrics.avgFaithfulness).toBe(0.75);
    });
  });
});

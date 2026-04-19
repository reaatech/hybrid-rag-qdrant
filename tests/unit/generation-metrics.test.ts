import { describe, it, expect } from 'vitest';
import {
  relevanceScore,
  fluencyScore,
  coherenceScore,
  faithfulnessScore,
  answerCorrectnessScore,
  evaluateGeneration,
  aggregateGenerationMetrics,
} from '../../src/evaluation/metrics/generation.js';

describe('generation metrics', () => {
  describe('relevanceScore', () => {
    it('returns 0 for empty query', () => {
      expect(relevanceScore('', 'some answer')).toBe(0);
    });

    it('returns 1 when all query words are in answer', () => {
      const score = relevanceScore('machine learning algorithms', 'This is about machine learning algorithms and their applications');
      expect(score).toBe(1);
    });

    it('returns partial score for partial match', () => {
      const score = relevanceScore('machine learning algorithms', 'This discusses learning');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('returns 0 when no words match', () => {
      const score = relevanceScore('machine learning', 'cooking recipes are great');
      expect(score).toBe(0);
    });
  });

  describe('fluencyScore', () => {
    it('returns 0 for empty text', () => {
      expect(fluencyScore('')).toBe(0);
    });

    it('returns higher score for well-formatted text', () => {
      const score = fluencyScore('This is a well-written sentence. It has proper capitalization and punctuation.');
      expect(score).toBeGreaterThan(0.5);
    });

    it('returns lower score for poorly formatted text', () => {
      const score = fluencyScore('no capitalization here just a run on sentence');
      expect(score).toBeLessThan(0.8);
    });
  });

  describe('coherenceScore', () => {
    it('returns 1 for single sentence', () => {
      expect(coherenceScore('This is a single sentence.')).toBe(1);
    });

    it('returns higher score with transition words', () => {
      const score = coherenceScore('First, we consider the input. However, the output is different. Therefore, we need to adjust.');
      expect(score).toBeGreaterThan(0.7);
    });
  });

  describe('faithfulnessScore', () => {
    it('returns 0 for empty source chunks', () => {
      expect(faithfulnessScore('some answer', [])).toBe(0);
    });

    it('returns 1 when answer is fully contained in source', () => {
      const source = ['Machine learning is a subset of artificial intelligence. It uses algorithms to learn from data.'];
      const answer = 'Machine learning is a subset of artificial intelligence.';
      const score = faithfulnessScore(answer, source);
      expect(score).toBe(1);
    });

    it('returns partial score for partial overlap', () => {
      const source = ['The sky is blue.'];
      const answer = 'The sky is green and the grass is blue.';
      const score = faithfulnessScore(answer, source);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });

  describe('answerCorrectnessScore', () => {
    it('returns 0 for empty ground truth', () => {
      expect(answerCorrectnessScore('some answer', '')).toBe(0);
    });

    it('returns 1 for exact match', () => {
      const score = answerCorrectnessScore('The capital of France is Paris', 'The capital of France is Paris');
      expect(score).toBe(1);
    });

    it('returns partial score for partial match', () => {
      const score = answerCorrectnessScore('Paris is capital of France', 'The capital of France is Paris');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('evaluateGeneration', () => {
    it('evaluates all metrics for a query', () => {
      const result = evaluateGeneration(
        'q1',
        'What is machine learning?',
        'Machine learning is a subset of AI.',
        ['Machine learning is a field of AI that uses statistical techniques.'],
        'Machine learning is a subset of artificial intelligence.'
      );

      expect(result.queryId).toBe('q1');
      expect(result.relevance).toBeGreaterThan(0);
      expect(result.fluency).toBeGreaterThan(0);
      expect(result.coherence).toBeGreaterThan(0);
      expect(result.faithfulness).toBeGreaterThan(0);
      expect(result.answerCorrectness).toBeGreaterThan(0);
    });

    it('omits answerCorrectness when ground truth not provided', () => {
      const result = evaluateGeneration(
        'q1',
        'What is ML?',
        'ML is great.',
        ['Some source text.']
      );

      expect(result.answerCorrectness).toBeUndefined();
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
      const results = [
        { queryId: 'q1', relevance: 0.8, fluency: 0.9, coherence: 0.7, faithfulness: 0.6 },
        { queryId: 'q2', relevance: 0.6, fluency: 0.7, coherence: 0.8, faithfulness: 0.5 },
      ];

      const metrics = aggregateGenerationMetrics(results);
      expect(metrics.avgRelevance).toBe(0.7);
      expect(metrics.avgFluency).toBe(0.8);
      expect(metrics.avgCoherence).toBe(0.75);
      expect(metrics.avgFaithfulness).toBe(0.55);
    });
  });
});

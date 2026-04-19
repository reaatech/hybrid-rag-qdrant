/**
 * Unit tests for quality tools MCP
 */

import { describe, it, expect } from 'vitest';
import {
  ragJudgeQuality,
  ragValidateResults,
  ragDetectHallucination,
  ragCompareConfigs,
  ragGetQualityMetrics,
  ragRunQualityCheck,
  qualityTools,
} from '../../../../src/mcp-server/tools/quality-tools.js';
import type { RAGPipeline } from '../../../../src/pipeline.js';

const mockPipeline = {} as RAGPipeline;

describe('Quality Tools', () => {
  describe('Tool definitions', () => {
    it('should have correct tool names', () => {
      expect(ragJudgeQuality.name).toBe('rag.judge_quality');
      expect(ragValidateResults.name).toBe('rag.validate_results');
      expect(ragDetectHallucination.name).toBe('rag.detect_hallucination');
      expect(ragCompareConfigs.name).toBe('rag.compare_configs');
      expect(ragGetQualityMetrics.name).toBe('rag.get_quality_metrics');
      expect(ragRunQualityCheck.name).toBe('rag.run_quality_check');
    });

    it('should export all tools in array', () => {
      expect(qualityTools).toHaveLength(6);
    });
  });

  describe('ragJudgeQuality', () => {
    it('should judge quality of results', async () => {
      const results = [
        { chunk_id: 'c1', content: 'Python is a programming language', score: 0.9 },
        { chunk_id: 'c2', content: 'JavaScript is also a programming language', score: 0.8 },
      ];

      const result = await ragJudgeQuality.handler(
        { query: 'What is Python?', results },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.query).toBe('What is Python?');
      expect(response.results).toHaveLength(2);
      expect(response.consensus_score).toBeDefined();
      expect(response.criteria).toContain('relevance');
    });

    it('should use default judge model', async () => {
      const result = await ragJudgeQuality.handler(
        { query: 'Test', results: [{ chunk_id: 'c1', content: 'Test content' }] },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.judge_model).toBe('claude-sonnet');
    });

    it('should use custom criteria', async () => {
      const result = await ragJudgeQuality.handler(
        {
          query: 'Test',
          results: [{ chunk_id: 'c1', content: 'Test content' }],
          criteria: ['accuracy', 'relevance'],
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.criteria).toEqual(['accuracy', 'relevance']);
    });

    it('should provide recommendations based on score', async () => {
      const result = await ragJudgeQuality.handler(
        { query: 'Test', results: [{ chunk_id: 'c1', content: 'Test content' }] },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.recommendations).toBeDefined();
      expect(Array.isArray(response.recommendations)).toBe(true);
    });
  });

  describe('ragValidateResults', () => {
    it('should validate results with high scores', async () => {
      const results = [
        { chunk_id: 'c1', content: 'Test', score: 0.9 },
        { chunk_id: 'c2', content: 'Test', score: 0.85 },
        { chunk_id: 'c3', content: 'Test', score: 0.8 },
      ];

      const result = await ragValidateResults.handler(
        { query: 'Test query', results },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.passed).toBe(true);
      expect(response.validations).toBeDefined();
    });

    it('should fail validation when no results', async () => {
      const result = await ragValidateResults.handler(
        { query: 'Test query', results: [] },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.passed).toBe(false);
      expect(response.validations.has_results).toBe(false);
    });

    it('should use custom thresholds', async () => {
      const results = [
        { chunk_id: 'c1', content: 'Test', score: 0.5 },
        { chunk_id: 'c2', content: 'Test', score: 0.5 },
        { chunk_id: 'c3', content: 'Test', score: 0.5 },
      ];

      const result = await ragValidateResults.handler(
        {
          query: 'Test',
          results,
          thresholds: { min_relevance: 0.6, min_completeness: 0.5, min_results: 2 },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.validations.meets_min_results).toBe(true);
    });

    it('should provide recommendations when failing', async () => {
      const result = await ragValidateResults.handler(
        { query: 'Test', results: [] },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.recommendations).toBeDefined();
      expect(response.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('ragDetectHallucination', () => {
    it('should detect hallucination in answer', async () => {
      const retrievedChunks = [
        { content: 'Python is a programming language created by Guido van Rossum', source: 'doc1' },
        { content: 'JavaScript was created by Brendan Eich in 1995', source: 'doc2' },
      ];

      const result = await ragDetectHallucination.handler(
        {
          query: 'Who created Python?',
          generated_answer: 'Python was created by Guido van Rossum in 1991.',
          retrieved_chunks: retrievedChunks,
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.query).toBe('Who created Python?');
      expect(typeof response.hallucination_detected).toBe('boolean');
      expect(response.confidence).toBeDefined();
      expect(response.support_score).toBeDefined();
    });

    it('should use default threshold', async () => {
      const result = await ragDetectHallucination.handler(
        {
          query: 'Test',
          generated_answer: 'Test answer with some content here.',
          retrieved_chunks: [{ content: 'Test chunk content' }],
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.threshold).toBe(0.7);
    });

    it('should return contradictions when detected', async () => {
      const result = await ragDetectHallucination.handler(
        {
          query: 'Test',
          generated_answer: 'This is a generated answer with specific claims.',
          retrieved_chunks: [{ content: 'Completely different content' }],
          threshold: 0.3,
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.total_claims).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty retrieved chunks', async () => {
      const result = await ragDetectHallucination.handler(
        {
          query: 'Test',
          generated_answer: 'This answer mentions Python and JavaScript.',
          retrieved_chunks: [],
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.support_score).toBeDefined();
    });
  });

  describe('ragCompareConfigs', () => {
    it('should compare two configurations', async () => {
      const result = await ragCompareConfigs.handler(
        {
          query: 'Test query',
          config_a: { vectorWeight: 0.7, bm25Weight: 0.3, topK: 10 },
          config_b: { vectorWeight: 0.5, bm25Weight: 0.5, topK: 10 },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.query).toBe('Test query');
      expect(response.config_a).toBeDefined();
      expect(response.config_b).toBeDefined();
      expect(['a', 'b', 'tie']).toContain(response.winner);
    });

    it('should use default metric', async () => {
      const result = await ragCompareConfigs.handler(
        {
          query: 'Test',
          config_a: { topK: 10 },
          config_b: { topK: 5 },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.metric).toBe('relevance');
    });

    it('should return confidence score', async () => {
      const result = await ragCompareConfigs.handler(
        {
          query: 'Test',
          config_a: { topK: 10 },
          config_b: { topK: 5 },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.confidence).toBeDefined();
      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
    });

    it('should provide recommendation', async () => {
      const result = await ragCompareConfigs.handler(
        {
          query: 'Test',
          config_a: { topK: 10 },
          config_b: { topK: 5 },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.recommendation).toBeDefined();
    });
  });

  describe('ragGetQualityMetrics', () => {
    it('should return all metrics by default', async () => {
      const result = await ragGetQualityMetrics.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.metrics).toBeDefined();
      expect(response.metrics.quality_score).toBeDefined();
      expect(response.metrics.validation_score).toBeDefined();
    });

    it('should filter by metric names when specified', async () => {
      const result = await ragGetQualityMetrics.handler(
        { metricNames: ['quality_score'] },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(Object.keys(response.metrics)).toHaveLength(1);
    });

    it('should respect limit parameter', async () => {
      const result = await ragGetQualityMetrics.handler(
        { limit: 50 },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.generated_at).toBeDefined();
    });

    it('should include summary', async () => {
      const result = await ragGetQualityMetrics.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.summary).toBeDefined();
    });
  });

  describe('ragRunQualityCheck', () => {
    it('should run quality check', async () => {
      const result = await ragRunQualityCheck.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.check_id).toBeDefined();
      expect(response.frequency).toBe('daily');
      expect(typeof response.passed).toBe('boolean');
    });

    it('should use custom sample size', async () => {
      const result = await ragRunQualityCheck.handler(
        { sample_size: 50 },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.sample_size).toBe(50);
    });

    it('should use custom frequency', async () => {
      const result = await ragRunQualityCheck.handler(
        { frequency: 'hourly' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.frequency).toBe('hourly');
    });

    it('should include thresholds in response', async () => {
      const result = await ragRunQualityCheck.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.thresholds).toBeDefined();
      expect(response.thresholds.min_relevance).toBeDefined();
    });

    it('should return metrics', async () => {
      const result = await ragRunQualityCheck.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.metrics.avg_relevance).toBeDefined();
      expect(response.metrics.avg_completeness).toBeDefined();
      expect(response.metrics.hallucination_rate).toBeDefined();
    });

    it('should calculate next check time', async () => {
      const result = await ragRunQualityCheck.handler(
        { frequency: 'weekly' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.next_check).toBeDefined();
    });
  });
});

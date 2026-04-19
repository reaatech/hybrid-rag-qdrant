/**
 * Unit tests for evaluation MCP tools
 */

import { describe, it, expect } from 'vitest';
import {
  ragEvaluate,
  ragAblation,
  ragBenchmark,
  evaluationTools,
} from '../../../../src/mcp-server/tools/evaluation.js';
import type { RAGPipeline } from '../../../../src/pipeline.js';

const mockPipeline = {} as RAGPipeline;

describe('Evaluation Tools', () => {
  describe('Tool definitions', () => {
    it('should have correct tool names', () => {
      expect(ragEvaluate.name).toBe('rag.evaluate');
      expect(ragAblation.name).toBe('rag.ablation');
      expect(ragBenchmark.name).toBe('rag.benchmark');
    });

    it('should export all tools in array', () => {
      expect(evaluationTools).toHaveLength(3);
    });
  });

  describe('ragEvaluate', () => {
    it('should require datasetPath', async () => {
      const result = await ragEvaluate.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.datasetPath).toBeUndefined();
    });

    it('should accept datasetPath parameter', async () => {
      const result = await ragEvaluate.handler(
        { datasetPath: '/path/to/dataset.jsonl' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.datasetPath).toBe('/path/to/dataset.jsonl');
    });

    it('should return undefined metrics when not provided', async () => {
      const result = await ragEvaluate.handler(
        { datasetPath: '/path/to/dataset.jsonl' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.metrics).toBeUndefined();
    });

    it('should accept custom metrics', async () => {
      const result = await ragEvaluate.handler(
        {
          datasetPath: '/path/to/dataset.jsonl',
          metrics: ['precision@5', 'recall@5'],
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.metrics).toEqual(['precision@5', 'recall@5']);
    });

    it('should return undefined topK when not provided', async () => {
      const result = await ragEvaluate.handler(
        { datasetPath: '/path/to/dataset.jsonl' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.topK).toBeUndefined();
    });

    it('should accept custom topK', async () => {
      const result = await ragEvaluate.handler(
        {
          datasetPath: '/path/to/dataset.jsonl',
          topK: 20,
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.topK).toBe(20);
    });
  });

  describe('ragAblation', () => {
    it('should require both configPath and datasetPath', async () => {
      const result = await ragAblation.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.configPath).toBeUndefined();
      expect(response.datasetPath).toBeUndefined();
    });

    it('should accept configPath and datasetPath', async () => {
      const result = await ragAblation.handler(
        {
          configPath: '/path/to/ablation-config.yaml',
          datasetPath: '/path/to/dataset.jsonl',
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.configPath).toBe('/path/to/ablation-config.yaml');
      expect(response.datasetPath).toBe('/path/to/dataset.jsonl');
    });

    it('should include message about implementation', async () => {
      const result = await ragAblation.handler(
        {
          configPath: '/path/to/config.yaml',
          datasetPath: '/path/to/dataset.jsonl',
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.message).toContain('Ablation study tool');
    });
  });

  describe('ragBenchmark', () => {
    it('should require queriesPath', async () => {
      const result = await ragBenchmark.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.queriesPath).toBeUndefined();
    });

    it('should accept queriesPath', async () => {
      const result = await ragBenchmark.handler(
        { queriesPath: '/path/to/queries.jsonl' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.queriesPath).toBe('/path/to/queries.jsonl');
    });

    it('should return undefined warmupQueries when not provided', async () => {
      const result = await ragBenchmark.handler(
        { queriesPath: '/path/to/queries.jsonl' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.warmupQueries).toBeUndefined();
    });

    it('should return undefined testQueries when not provided', async () => {
      const result = await ragBenchmark.handler(
        { queriesPath: '/path/to/queries.jsonl' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.testQueries).toBeUndefined();
    });

    it('should return undefined concurrency when not provided', async () => {
      const result = await ragBenchmark.handler(
        { queriesPath: '/path/to/queries.jsonl' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.concurrency).toBeUndefined();
    });

    it('should accept custom warmup queries', async () => {
      const result = await ragBenchmark.handler(
        {
          queriesPath: '/path/to/queries.jsonl',
          warmupQueries: 5,
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.warmupQueries).toBe(5);
    });

    it('should accept custom test queries', async () => {
      const result = await ragBenchmark.handler(
        {
          queriesPath: '/path/to/queries.jsonl',
          testQueries: 50,
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.testQueries).toBe(50);
    });

    it('should accept custom concurrency levels', async () => {
      const result = await ragBenchmark.handler(
        {
          queriesPath: '/path/to/queries.jsonl',
          concurrency: [1, 10, 20],
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.concurrency).toEqual([1, 10, 20]);
    });
  });
});

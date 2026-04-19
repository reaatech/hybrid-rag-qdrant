/**
 * Unit tests for query analysis MCP tools
 */

import { describe, it, expect } from 'vitest';
import {
  ragAnalyzeQuery,
  ragDecomposeQuery,
  ragClassifyIntent,
  queryAnalysisTools,
} from '../../../../src/mcp-server/tools/query-analysis.js';
import type { RAGPipeline } from '../../../../src/pipeline.js';

const mockPipeline = {} as RAGPipeline;

describe('Query Analysis Tools', () => {
  describe('Tool definitions', () => {
    it('should have correct tool names', () => {
      expect(ragAnalyzeQuery.name).toBe('rag.analyze_query');
      expect(ragDecomposeQuery.name).toBe('rag.decompose_query');
      expect(ragClassifyIntent.name).toBe('rag.classify_intent');
    });

    it('should export all tools in array', () => {
      expect(queryAnalysisTools).toHaveLength(3);
    });
  });

  describe('ragAnalyzeQuery', () => {
    it('should analyze factual query', async () => {
      const result = await ragAnalyzeQuery.handler(
        { query: 'What is machine learning?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('factual');
      expect(response.recommended_config).toBeDefined();
      expect(response.recommended_config.vectorWeight).toBe(0.8);
      expect(response.recommended_config.bm25Weight).toBe(0.2);
    });

    it('should analyze procedural query', async () => {
      const result = await ragAnalyzeQuery.handler(
        { query: 'How do I install Python on Ubuntu?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('procedural');
      expect(response.recommended_config.useReranker).toBe(true);
    });

    it('should analyze comparative query', async () => {
      const result = await ragAnalyzeQuery.handler(
        { query: 'React vs Vue for web development' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('comparative');
    });

    it('should analyze exploratory query', async () => {
      const result = await ragAnalyzeQuery.handler(
        { query: 'Tell me about machine learning' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('exploratory');
    });

    it('should analyze troubleshooting query', async () => {
      const result = await ragAnalyzeQuery.handler(
        { query: 'My application is not working, how to fix it?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('troubleshooting');
    });

    it('should include context in analysis when provided', async () => {
      const result = await ragAnalyzeQuery.handler(
        {
          query: 'What is the API rate limit?',
          context: {
            user_tier: 'enterprise',
            previous_queries: ['how to authenticate', 'get API key'],
          },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.context_used).toContain('user_tier');
      expect(response.context_used).toContain('previous_queries');
    });

    it('should detect complex queries with sub-queries', async () => {
      const result = await ragAnalyzeQuery.handler(
        { query: 'Explain Python and describe its features' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.isComplex).toBe(true);
      expect(response.sub_queries).toBeDefined();
    });

    it('should return confidence score', async () => {
      const result = await ragAnalyzeQuery.handler(
        { query: 'What is 2+2?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.confidence).toBeDefined();
      expect(typeof response.confidence).toBe('number');
    });
  });

  describe('ragDecomposeQuery', () => {
    it('should decompose query with conjunction', async () => {
      const result = await ragDecomposeQuery.handler(
        { query: 'What is Python and how do I install it?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.sub_queries.length).toBeGreaterThan(1);
      expect(response.strategy).toBeDefined();
    });

    it('should not decompose simple query', async () => {
      const result = await ragDecomposeQuery.handler(
        { query: 'What is Python?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.sub_queries.length).toBe(1);
      expect(response.sub_queries[0].query).toBe('What is Python?');
    });

    it('should filter by confidence threshold', async () => {
      const result = await ragDecomposeQuery.handler(
        { query: 'What and How', minSubQueryConfidence: 0.9 },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      // Very short queries have low confidence
      expect(response.sub_queries.length).toBeLessThanOrEqual(2);
    });

    it('should respect maxDepth parameter', async () => {
      const result = await ragDecomposeQuery.handler(
        { query: 'A and B and C and D', maxDepth: 2 },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response).toBeDefined();
    });

    it('should include intent classification for sub-queries', async () => {
      const result = await ragDecomposeQuery.handler(
        { query: 'What is AI and how does ML work?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      response.sub_queries.forEach((sq: { intent: string }) => {
        expect(sq.intent).toBeDefined();
      });
    });
  });

  describe('ragClassifyIntent', () => {
    it('should classify factual queries', async () => {
      const result = await ragClassifyIntent.handler(
        { query: 'Who invented Python?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('factual');
      expect(response.description).toBeDefined();
    });

    it('should classify definitional queries', async () => {
      const result = await ragClassifyIntent.handler(
        { query: 'Define machine learning' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('definitional');
    });

    it('should filter to candidate intents', async () => {
      const result = await ragClassifyIntent.handler(
        {
          query: 'What is Python?',
          candidates: ['factual', 'definitional'],
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.all_intents).toContain('factual');
      expect(response.all_intents).toContain('definitional');
      expect(response.all_intents).not.toContain('troubleshooting');
    });

    it('should recommend strategies for each intent', async () => {
      const result = await ragClassifyIntent.handler(
        { query: 'Compare Python and JavaScript' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.recommended_strategy).toBeDefined();
      expect(response.recommended_strategy.vectorWeight).toBeDefined();
      expect(response.recommended_strategy.bm25Weight).toBeDefined();
      expect(response.recommended_strategy.topK).toBeDefined();
    });

    it('should return all intents when no candidates specified', async () => {
      const result = await ragClassifyIntent.handler(
        { query: 'What is Python?' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.all_intents.length).toBe(6);
    });

    it('should handle comparative queries with vs pattern', async () => {
      const result = await ragClassifyIntent.handler(
        { query: 'Python vs JavaScript performance comparison' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('comparative');
    });

    it('should handle troubleshooting queries', async () => {
      const result = await ragClassifyIntent.handler(
        { query: 'Error: Cannot connect to database' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.intent).toBe('troubleshooting');
    });
  });
});

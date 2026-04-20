/**
 * Unit tests for cost management MCP tools
 */

import { describe, it, expect } from 'vitest';
import {
  ragGetCostEstimate,
  ragSetBudget,
  ragGetBudgetStatus,
  ragOptimizeCost,
  ragGetCostReport,
  ragSetCostControls,
  costManagementTools,
} from '../../../../src/mcp-server/tools/cost-management.js';
import type { RAGPipeline } from '../../../../src/pipeline.js';

// Mock RAGPipeline
const mockPipeline = {} as RAGPipeline;

describe('Cost Management Tools', () => {
  describe('Tool definitions', () => {
    it('should have correct tool names', () => {
      expect(ragGetCostEstimate.name).toBe('rag.get_cost_estimate');
      expect(ragSetBudget.name).toBe('rag.set_budget');
      expect(ragGetBudgetStatus.name).toBe('rag.get_budget_status');
      expect(ragOptimizeCost.name).toBe('rag.optimize_cost');
      expect(ragGetCostReport.name).toBe('rag.get_cost_report');
      expect(ragSetCostControls.name).toBe('rag.set_cost_controls');
    });

    it('should export all tools in array', () => {
      expect(costManagementTools).toHaveLength(6);
    });
  });

  describe('ragGetCostEstimate', () => {
    it('should estimate cost for simple query', async () => {
      const result = await ragGetCostEstimate.handler(
        { query: 'What is machine learning?' },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.total_cost).toBeGreaterThan(0);
      expect(response.estimated_tokens).toBeGreaterThan(0);
      expect(response.cost_breakdown).toBeDefined();
    });

    it('should use default config values', async () => {
      const result = await ragGetCostEstimate.handler({ query: 'Test query' }, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.config.embedding_model).toBe('text-embedding-3-small');
      expect(response.config.top_k).toBe(10);
      expect(response.config.use_reranker).toBe(false);
    });

    it('should apply custom config', async () => {
      const result = await ragGetCostEstimate.handler(
        {
          query: 'Test query',
          config: {
            useReranker: true,
            rerankerProvider: 'cohere',
            topK: 20,
            embeddingModel: 'text-embedding-3-large',
          },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.config.use_reranker).toBe(true);
      expect(response.config.reranker_provider).toBe('cohere');
      expect(response.config.top_k).toBe(20);
      expect(response.config.embedding_model).toBe('text-embedding-3-large');
    });

    it('should include reranking cost when enabled', async () => {
      await ragGetCostEstimate.handler(
        { query: 'Test', config: { useReranker: false } },
        mockPipeline,
      );
      const withReranker = await ragGetCostEstimate.handler(
        { query: 'Test', config: { useReranker: true, topK: 10 } },
        mockPipeline,
      );

      const withResponse = JSON.parse((withReranker.content[0] as { text: string }).text);

      expect(withResponse.cost_breakdown.reranking).toBeGreaterThan(0);
    });

    it('should calculate different costs for different models', async () => {
      const smallResult = await ragGetCostEstimate.handler(
        { query: 'Test', config: { embeddingModel: 'text-embedding-3-small' } },
        mockPipeline,
      );
      const largeResult = await ragGetCostEstimate.handler(
        { query: 'Test', config: { embeddingModel: 'text-embedding-3-large' } },
        mockPipeline,
      );

      const smallResponse = JSON.parse((smallResult.content[0] as { text: string }).text);
      const largeResponse = JSON.parse((largeResult.content[0] as { text: string }).text);

      expect(largeResponse.cost_breakdown.embeddings).toBeGreaterThan(
        smallResponse.cost_breakdown.embeddings,
      );
    });
  });

  describe('ragSetBudget', () => {
    it('should set budget with required fields', async () => {
      const result = await ragSetBudget.handler(
        {
          budget_type: 'daily',
          limit: 100,
        },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.success).toBe(true);
      expect(response.budget.limit).toBe(100);
    });

    it('should set custom alert thresholds', async () => {
      const result = await ragSetBudget.handler(
        {
          budget_type: 'daily',
          limit: 100,
          alert_thresholds: [0.25, 0.5, 0.75],
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.budget.alert_thresholds).toEqual([0.25, 0.5, 0.75]);
    });

    it('should set hard limit', async () => {
      const result = await ragSetBudget.handler(
        {
          budget_type: 'daily',
          limit: 100,
          hard_limit: true,
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.budget.hard_limit).toBe(true);
    });

    it('should set budget with scope', async () => {
      const result = await ragSetBudget.handler(
        {
          budget_type: 'daily',
          limit: 100,
          scope: { user_id: 'user-123', project: 'my-project' },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.budget.scope.user_id).toBe('user-123');
    });

    it('should accept per-query budget type', async () => {
      const result = await ragSetBudget.handler(
        {
          budget_type: 'per-query',
          limit: 0.5,
        },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
    });

    it('should accept monthly budget type', async () => {
      const result = await ragSetBudget.handler(
        {
          budget_type: 'monthly',
          limit: 1000,
        },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
    });
  });

  describe('ragGetBudgetStatus', () => {
    it('should return budget status when set', async () => {
      // Set budget first
      await ragSetBudget.handler({ budget_type: 'daily', limit: 100 }, mockPipeline);

      // Then get status
      const result = await ragGetBudgetStatus.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.status).toBeDefined();
      expect(response.status.limit).toBe(100);
    });

    it('should return status for scoped budget', async () => {
      // Set scoped budget
      await ragSetBudget.handler(
        {
          budget_type: 'daily',
          limit: 50,
          scope: { user_id: 'test-user' },
        },
        mockPipeline,
      );

      const result = await ragGetBudgetStatus.handler(
        { scope: { user_id: 'test-user' } },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.status).toBeDefined();
    });
  });

  describe('ragOptimizeCost', () => {
    it('should return optimization recommendations', async () => {
      const result = await ragOptimizeCost.handler(
        {
          current_config: {
            useReranker: true,
            rerankerProvider: 'cohere',
            topK: 20,
          },
        },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.recommendations).toBeDefined();
      expect(Array.isArray(response.recommendations)).toBe(true);
    });

    it('should calculate potential savings', async () => {
      const result = await ragOptimizeCost.handler(
        {
          current_config: {
            useReranker: true,
            rerankerProvider: 'cohere',
            topK: 20,
          },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.total_potential_savings).toBeGreaterThan(0);
      expect(response.new_estimated_cost).toBeLessThan(response.current_estimated_cost);
    });

    it('should filter recommendations by target quality', async () => {
      const result = await ragOptimizeCost.handler(
        {
          current_config: {
            useReranker: true,
            rerankerProvider: 'cohere',
            topK: 20,
          },
          target_quality: 0.95,
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      // High quality target should filter out medium impact recommendations
      response.recommendations.forEach((rec: { quality_impact: string }) => {
        expect(rec.quality_impact).not.toBe('high');
      });
    });

    it('should return recommendations for cohere reranker', async () => {
      const result = await ragOptimizeCost.handler(
        {
          current_config: {
            useReranker: true,
            rerankerProvider: 'cohere',
            topK: 10,
          },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      const hasLocalRerankerRec = response.recommendations.some(
        (rec: { strategy: string }) => rec.strategy === 'Use local reranker',
      );
      expect(hasLocalRerankerRec).toBe(true);
    });

    it('should return recommendations for high topK', async () => {
      const result = await ragOptimizeCost.handler(
        {
          current_config: {
            useReranker: false,
            topK: 20,
          },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      const hasReduceTopKRec = response.recommendations.some(
        (rec: { strategy: string }) => rec.strategy === 'Reduce topK',
      );
      expect(hasReduceTopKRec).toBe(true);
    });

    it('should return recommendations for large embedding model', async () => {
      const result = await ragOptimizeCost.handler(
        {
          current_config: {
            useReranker: false,
            topK: 10,
            embeddingModel: 'text-embedding-3-large',
          },
        },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      const hasSmallerModelRec = response.recommendations.some(
        (rec: { strategy: string }) => rec.strategy === 'Use smaller embedding model',
      );
      expect(hasSmallerModelRec).toBe(true);
    });
  });

  describe('ragGetCostReport', () => {
    it('should return cost breakdown', async () => {
      const result = await ragGetCostReport.handler({}, mockPipeline);

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.breakdown).toBeDefined();
      expect(response.breakdown.total).toBeDefined();
    });

    it('should support different periods', async () => {
      const dayResult = await ragGetCostReport.handler({ period: 'day' }, mockPipeline);
      const weekResult = await ragGetCostReport.handler({ period: 'week' }, mockPipeline);
      const monthResult = await ragGetCostReport.handler({ period: 'month' }, mockPipeline);

      expect(dayResult.isError).toBeFalsy();
      expect(weekResult.isError).toBeFalsy();
      expect(monthResult.isError).toBeFalsy();
    });

    it('should include trends when requested', async () => {
      const result = await ragGetCostReport.handler({ include_trends: true }, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.trends).toBeDefined();
    });

    it('should include largest component in summary', async () => {
      const result = await ragGetCostReport.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.summary.largest_component).toBeDefined();
    });
  });

  describe('ragSetCostControls', () => {
    it('should set max cost per query', async () => {
      const result = await ragSetCostControls.handler({ max_cost_per_query: 0.1 }, mockPipeline);

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.success).toBe(true);
      expect(response.configuration.max_cost_per_query).toBe(0.1);
    });

    it('should set max cost per day', async () => {
      const result = await ragSetCostControls.handler({ max_cost_per_day: 50 }, mockPipeline);

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.configuration.max_cost_per_day).toBe(50);
    });

    it('should set alert thresholds', async () => {
      const result = await ragSetCostControls.handler(
        { alert_thresholds: [0.3, 0.6, 0.9] },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.configuration.alert_thresholds).toEqual([0.3, 0.6, 0.9]);
    });

    it('should set hard limit', async () => {
      const result = await ragSetCostControls.handler({ hard_limit: true }, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.configuration.hard_limit).toBe(true);
    });

    it('should set multiple controls at once', async () => {
      const result = await ragSetCostControls.handler(
        {
          max_cost_per_query: 0.1,
          max_cost_per_day: 50,
          alert_thresholds: [0.5, 0.8],
          hard_limit: true,
          alert_channels: ['email', 'slack'],
        },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.configuration.max_cost_per_query).toBe(0.1);
      expect(response.configuration.max_cost_per_day).toBe(50);
      expect(response.configuration.alert_channels).toContain('email');
    });
  });
});

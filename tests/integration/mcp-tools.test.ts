import { describe, it, expect, vi } from 'vitest';
import { queryAnalysisTools } from '../../src/mcp-server/tools/query-analysis.js';
import { sessionManagementTools } from '../../src/mcp-server/tools/session-management.js';
import { agentIntegrationTools } from '../../src/mcp-server/tools/agent-integration.js';
import { costManagementTools } from '../../src/mcp-server/tools/cost-management.js';
import { qualityTools } from '../../src/mcp-server/tools/quality-tools.js';
import { observabilityTools } from '../../src/mcp-server/tools/observability-tools.js';

// Mock pipeline
const mockPipeline = {
  query: vi.fn().mockResolvedValue([]),
  ingest: vi.fn().mockResolvedValue([]),
  close: vi.fn().mockResolvedValue(undefined),
};

describe('MCP Tools Integration', () => {
  describe('Query Analysis Tools', () => {
    it('has correct number of tools', () => {
      expect(queryAnalysisTools).toHaveLength(3);
    });

    it('each tool has required properties', () => {
      queryAnalysisTools.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('handler');
        expect(typeof tool.handler).toBe('function');
      });
    });

    it('rag.analyze_query tool executes', async () => {
      const tool = queryAnalysisTools.find((t) => t.name === 'rag.analyze_query');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: 'test query' }, mockPipeline);
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('rag.decompose_query tool executes', async () => {
      const tool = queryAnalysisTools.find((t) => t.name === 'rag.decompose_query');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: 'complex query' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.classify_intent tool executes', async () => {
      const tool = queryAnalysisTools.find((t) => t.name === 'rag.classify_intent');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: 'what is the weather' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });
  });

  describe('Session Management Tools', () => {
    it('has correct number of tools', () => {
      expect(sessionManagementTools).toHaveLength(3);
    });

    it('rag.session_manage tool executes', async () => {
      const tool = sessionManagementTools.find((t) => t.name === 'rag.session_manage');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ action: 'create' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.get_context tool executes', async () => {
      const tool = sessionManagementTools.find((t) => t.name === 'rag.get_context');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ session_id: 'test-session' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.session_history tool executes', async () => {
      const tool = sessionManagementTools.find((t) => t.name === 'rag.session_history');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ session_id: 'test-session' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });
  });

  describe('Agent Integration Tools', () => {
    it('has correct number of tools', () => {
      expect(agentIntegrationTools).toHaveLength(4);
    });

    it('rag.discover_agents tool executes', async () => {
      const tool = agentIntegrationTools.find((t) => t.name === 'rag.discover_agents');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.route_to_agent tool executes', async () => {
      const tool = agentIntegrationTools.find((t) => t.name === 'rag.route_to_agent');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: 'test', intent: 'factual' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.get_agent_capabilities tool executes', async () => {
      const tool = agentIntegrationTools.find((t) => t.name === 'rag.get_agent_capabilities');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ agent_id: 'agent-1' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.register_callback tool executes', async () => {
      const tool = agentIntegrationTools.find((t) => t.name === 'rag.register_callback');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ callback_url: 'http://example.com' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });
  });

  describe('Cost Management Tools', () => {
    it('has correct number of tools', () => {
      expect(costManagementTools).toHaveLength(6);
    });

    it('rag.get_cost_estimate tool executes', async () => {
      const tool = costManagementTools.find((t) => t.name === 'rag.get_cost_estimate');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query: 'test' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.set_budget tool executes', async () => {
      const tool = costManagementTools.find((t) => t.name === 'rag.set_budget');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ monthly_budget: 100 }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.get_budget_status tool executes', async () => {
      const tool = costManagementTools.find((t) => t.name === 'rag.get_budget_status');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.optimize_cost tool executes', async () => {
      const tool = costManagementTools.find((t) => t.name === 'rag.optimize_cost');
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        { current_config: { useReranker: true, topK: 10 } },
        mockPipeline,
      );
      expect(result).toHaveProperty('content');
    });

    it('rag.get_cost_report tool executes', async () => {
      const tool = costManagementTools.find((t) => t.name === 'rag.get_cost_report');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ period: 'monthly' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.set_cost_controls tool executes', async () => {
      const tool = costManagementTools.find((t) => t.name === 'rag.set_cost_controls');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ max_cost_per_query: 0.01 }, mockPipeline);
      expect(result).toHaveProperty('content');
    });
  });

  describe('Quality Tools', () => {
    it('has correct number of tools', () => {
      expect(qualityTools).toHaveLength(6);
    });

    it('rag.judge_quality tool executes', async () => {
      const tool = qualityTools.find((t) => t.name === 'rag.judge_quality');
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        {
          query: 'test',
          results: [{ chunk_id: '1', content: 'test content' }],
        },
        mockPipeline,
      );
      expect(result).toHaveProperty('content');
    });

    it('rag.validate_results tool executes', async () => {
      const tool = qualityTools.find((t) => t.name === 'rag.validate_results');
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        {
          query: 'test',
          results: [{ chunk_id: '1', content: 'test content' }],
        },
        mockPipeline,
      );
      expect(result).toHaveProperty('content');
    });

    it('rag.detect_hallucination tool executes', async () => {
      const tool = qualityTools.find((t) => t.name === 'rag.detect_hallucination');
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        {
          query: 'test',
          generated_answer: 'The answer is 42.',
          retrieved_chunks: [{ content: 'The answer to life is 42' }],
        },
        mockPipeline,
      );
      expect(result).toHaveProperty('content');
    });

    it('rag.compare_configs tool executes', async () => {
      const tool = qualityTools.find((t) => t.name === 'rag.compare_configs');
      expect(tool).toBeDefined();

      const result = await tool!.handler(
        {
          query: 'test',
          config_a: { topK: 10 },
          config_b: { topK: 5 },
        },
        mockPipeline,
      );
      expect(result).toHaveProperty('content');
    });

    it('rag.get_quality_metrics tool executes', async () => {
      const tool = qualityTools.find((t) => t.name === 'rag.get_quality_metrics');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.run_quality_check tool executes', async () => {
      const tool = qualityTools.find((t) => t.name === 'rag.run_quality_check');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ sample_size: 100 }, mockPipeline);
      expect(result).toHaveProperty('content');
    });
  });

  describe('Observability Tools', () => {
    it('has correct number of tools', () => {
      expect(observabilityTools).toHaveLength(6);
    });

    it('rag.get_metrics tool executes', async () => {
      const tool = observabilityTools.find((t) => t.name === 'rag.get_metrics');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.get_trace tool executes', async () => {
      const tool = observabilityTools.find((t) => t.name === 'rag.get_trace');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ query_id: 'trace-123' }, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.health_check tool executes', async () => {
      const tool = observabilityTools.find((t) => t.name === 'rag.health_check');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.get_performance tool executes', async () => {
      const tool = observabilityTools.find((t) => t.name === 'rag.get_performance');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.get_collection_stats tool executes', async () => {
      const tool = observabilityTools.find((t) => t.name === 'rag.get_collection_stats');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, mockPipeline);
      expect(result).toHaveProperty('content');
    });

    it('rag.monitor_alerts tool executes', async () => {
      const tool = observabilityTools.find((t) => t.name === 'rag.monitor_alerts');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}, mockPipeline);
      expect(result).toHaveProperty('content');
    });
  });

  describe('All Tools Combined', () => {
    it('total tool count is correct', () => {
      const total =
        queryAnalysisTools.length +
        sessionManagementTools.length +
        agentIntegrationTools.length +
        costManagementTools.length +
        qualityTools.length +
        observabilityTools.length;

      expect(total).toBe(28);
    });

    it('all tool names are unique', () => {
      const allTools = [
        ...queryAnalysisTools,
        ...sessionManagementTools,
        ...agentIntegrationTools,
        ...costManagementTools,
        ...qualityTools,
        ...observabilityTools,
      ];

      const names = allTools.map((t) => t.name);
      const uniqueNames = new Set(names);

      expect(names.length).toBe(uniqueNames.size);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  agentIntegrationTools,
  ragDiscoverAgents,
  ragGetAgentCapabilities,
  ragRegisterCallback,
  ragRouteToAgent,
} from './agent-integration.js';

const pipeline = makePipeline({});

describe('agentIntegrationTools registry', () => {
  it('exports four tools', () => {
    expect(agentIntegrationTools.map((t) => t.name)).toEqual([
      'rag.discover_agents',
      'rag.route_to_agent',
      'rag.get_agent_capabilities',
      'rag.register_callback',
    ]);
  });
});

describe('rag.discover_agents', () => {
  it('returns full details by default', async () => {
    const res = await ragDiscoverAgents.handler({}, pipeline);
    const payload = parseToolResult(res);
    expect(payload.total_agents).toBeGreaterThanOrEqual(3);
    expect((payload.agents as Array<{ capabilities: unknown }>)[0].capabilities).toBeDefined();
  });

  it('returns summary view when include_details is false', async () => {
    const res = await ragDiscoverAgents.handler({ include_details: false }, pipeline);
    const agents = parseToolResult(res).agents as Array<Record<string, unknown>>;
    expect(Array.isArray(agents[0].capabilities)).toBe(true);
    expect(typeof (agents[0].capabilities as unknown[])[0]).toBe('string');
  });

  it('filters by capability', async () => {
    const res = await ragDiscoverAgents.handler(
      { filter: { capabilities: ['calculation'] } },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.total_agents).toBe(1);
  });
});

describe('rag.route_to_agent', () => {
  it('routes to an explicit target agent (sync)', async () => {
    const res = await ragRouteToAgent.handler(
      { query: 'compute 2+2', target_agent: 'calculator' },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.target_agent).toBe('calculator');
    expect(payload.status).toBe('completed');
    expect((payload.response as Record<string, unknown>).message).toContain('Calculator');
  });

  it('errors when the target agent is unknown', async () => {
    const res = await ragRouteToAgent.handler({ query: 'x', target_agent: 'ghost' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('Agent not found');
  });

  it('auto-selects an agent by intent routing weights', async () => {
    const res = await ragRouteToAgent.handler(
      { query: 'analyze trends', intent: 'exploratory' },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.target_agent).toBe('data-analyst');
    expect((payload.response as Record<string, unknown>).message).toContain('Data analyst');
  });

  it('falls back to the default agent when no intent weight matches', async () => {
    const res = await ragRouteToAgent.handler({ query: 'hello there' }, pipeline);
    const payload = parseToolResult(res);
    expect(payload.target_agent).toBe('hybrid-rag');
    expect((payload.response as Record<string, unknown>).message).toContain('RAG');
  });

  it('queues async requests', async () => {
    const res = await ragRouteToAgent.handler(
      { query: 'x', target_agent: 'calculator', async: true },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.status).toBe('queued');
    expect(payload.request_id).toMatch(/^req-/);
  });

  it('passes return_to_rag through to the response', async () => {
    const res = await ragRouteToAgent.handler(
      { query: 'x', target_agent: 'calculator', return_to_rag: true },
      pipeline,
    );
    expect(parseToolResult(res).return_to_rag).toBe(true);
  });
});

describe('rag.get_agent_capabilities', () => {
  it('returns capabilities for a specific agent', async () => {
    const res = await ragGetAgentCapabilities.handler({ agent_id: 'calculator' }, pipeline);
    const payload = parseToolResult(res);
    expect(payload.total_capabilities).toBe(2);
  });

  it('returns empty when the agent does not exist', async () => {
    const res = await ragGetAgentCapabilities.handler({ agent_id: 'ghost' }, pipeline);
    expect(parseToolResult(res).total_capabilities).toBe(0);
  });

  it('aggregates capabilities across all agents', async () => {
    const res = await ragGetAgentCapabilities.handler({}, pipeline);
    expect(parseToolResult(res).total_capabilities as number).toBeGreaterThan(2);
  });

  it('filters capabilities by name', async () => {
    const res = await ragGetAgentCapabilities.handler({ capability_name: 'calculation' }, pipeline);
    const payload = parseToolResult(res);
    expect(payload.total_capabilities).toBe(1);
  });
});

describe('rag.register_callback', () => {
  it('registers a valid callback', async () => {
    const res = await ragRegisterCallback.handler(
      { action: 'register', request_id: 'r1', callback_url: 'https://example.com/cb' },
      pipeline,
    );
    expect(parseToolResult(res).success).toBe(true);
  });

  it('requires request_id and callback_url for register', async () => {
    const res = await ragRegisterCallback.handler({ action: 'register' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('required');
  });

  it('rejects an invalid callback url', async () => {
    const res = await ragRegisterCallback.handler(
      { action: 'register', request_id: 'r1', callback_url: 'not a url' },
      pipeline,
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('valid URL');
  });

  it('unregisters a callback', async () => {
    const res = await ragRegisterCallback.handler(
      { action: 'unregister', request_id: 'r1' },
      pipeline,
    );
    expect(parseToolResult(res).success).toBe(true);
  });

  it('requires request_id for unregister', async () => {
    const res = await ragRegisterCallback.handler({ action: 'unregister' }, pipeline);
    expect(res.isError).toBe(true);
  });

  it('lists callbacks (demo mode)', async () => {
    const res = await ragRegisterCallback.handler({ action: 'list' }, pipeline);
    expect(parseToolResult(res).message).toContain('not implemented');
  });

  it('errors on unknown action', async () => {
    const res = await ragRegisterCallback.handler({ action: 'frob' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('Unknown action');
  });
});

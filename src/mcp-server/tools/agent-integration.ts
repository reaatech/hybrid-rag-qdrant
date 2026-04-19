/**
 * MCP Agent Integration Tools
 * 
 * Tools for discovering, routing to, and communicating with
 * agents in a multi-agent system like agent-mesh.
 */

import type { RAGTool } from '../../mcp-server/types.js';
import type { RAGPipeline } from '../../pipeline.js';

/**
 * Agent capability definition
 */
export interface AgentCapability {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

/**
 * Agent registration information
 */
export interface AgentInfo {
  agent_id: string;
  display_name: string;
  description: string;
  endpoint?: string;
  capabilities: AgentCapability[];
  is_default: boolean;
  confidence_threshold: number;
  routing_weights?: Record<string, number>;
}

/**
 * Simple in-memory agent registry
 * In production, this would integrate with agent-mesh or similar
 */
class AgentRegistry {
  private static readonly MAX_CALLBACKS = 1000;
  private agents: Map<string, AgentInfo> = new Map();
  private callbacks: Map<string, (response: unknown) => void> = new Map();

  /**
   * Register an agent
   */
  register(agent: AgentInfo): void {
    this.agents.set(agent.agent_id, agent);
  }

  /**
   * Get an agent by ID
   */
  get(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all agents
   */
  list(filter?: { capabilities?: string[] }): AgentInfo[] {
    let agents = Array.from(this.agents.values());
    
    if (filter?.capabilities) {
      agents = agents.filter(agent => 
        filter.capabilities!.some(cap => 
          agent.capabilities.some(ac => ac.name === cap)
        )
      );
    }
    
    return agents;
  }

  /**
   * Find best agent for a query based on intent
   */
  findBest(query: string, intent?: string): AgentInfo | undefined {
    // First try to find agents with matching routing weights
    if (intent) {
      let bestAgent: AgentInfo | undefined;
      let bestWeight = 0;

      for (const agent of this.agents.values()) {
        const weight = agent.routing_weights?.[intent] || 0;
        if (weight > bestWeight) {
          bestWeight = weight;
          bestAgent = agent;
        }
      }

      if (bestAgent && bestWeight > 0) {
        return bestAgent;
      }
    }

    // Fall back to default agent
    return Array.from(this.agents.values()).find(a => a.is_default);
  }

  /**
   * Register a callback for async responses
   */
  registerCallback(requestId: string, callback: (response: unknown) => void): void {
    if (this.callbacks.size >= AgentRegistry.MAX_CALLBACKS) { throw new Error('Maximum callbacks reached'); }
    this.callbacks.set(requestId, callback);
  }

  /**
   * Remove a callback
   */
  removeCallback(requestId: string): void {
    this.callbacks.delete(requestId);
  }

  /**
   * Get callback for a request
   */
  getCallback(requestId: string): ((response: unknown) => void) | undefined {
    return this.callbacks.get(requestId);
  }
}

// Global agent registry instance
const agentRegistry = new AgentRegistry();

/**
 * Register some default agents for demonstration
 */
function initializeDefaultAgents(): void {
  // RAG agent (this system itself)
  agentRegistry.register({
    agent_id: 'hybrid-rag-qdrant',
    display_name: 'Hybrid RAG System',
    description: 'Enterprise-grade RAG system with hybrid retrieval (vector + BM25), reranking, and evaluation',
    is_default: true,
    confidence_threshold: 0.85,
    capabilities: [
      { name: 'document_search', description: 'Search documents using hybrid retrieval' },
      { name: 'knowledge_retrieval', description: 'Retrieve relevant knowledge chunks' },
      { name: 'semantic_search', description: 'Perform semantic similarity search' },
      { name: 'multi_turn_qa', description: 'Handle multi-turn Q&A with context' },
    ],
    routing_weights: {
      factual: 0.9,
      procedural: 0.8,
      exploratory: 0.7,
      definitional: 0.9,
    },
  });

  // Calculator agent
  agentRegistry.register({
    agent_id: 'calculator',
    display_name: 'Calculator Agent',
    description: 'Performs mathematical calculations and cost analysis',
    is_default: false,
    confidence_threshold: 0.9,
    capabilities: [
      { name: 'calculation', description: 'Perform mathematical calculations' },
      { name: 'cost_analysis', description: 'Calculate costs and budgets' },
    ],
    routing_weights: {
      factual: 0.3,
    },
  });

  // Data analysis agent
  agentRegistry.register({
    agent_id: 'data-analyst',
    display_name: 'Data Analyst Agent',
    description: 'Analyzes data patterns and generates insights',
    is_default: false,
    confidence_threshold: 0.8,
    capabilities: [
      { name: 'data_analysis', description: 'Analyze data patterns' },
      { name: 'visualization', description: 'Create data visualizations' },
      { name: 'statistics', description: 'Perform statistical analysis' },
    ],
    routing_weights: {
      comparative: 0.8,
      exploratory: 0.9,
    },
  });
}

// Initialize default agents
initializeDefaultAgents();

/**
 * rag.discover_agents - Discover available agents in agent-mesh
 */
export const ragDiscoverAgents: RAGTool = {
  name: 'rag.discover_agents',
  description: 'Discover available agents in the multi-agent system',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'object',
        description: 'Filter criteria for agents',
        properties: {
          capabilities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required capabilities',
          },
        },
      },
      include_details: {
        type: 'boolean',
        description: 'Include full agent details',
        default: true,
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const filter = args.filter as { capabilities?: string[] } | undefined;
    const includeDetails = args.include_details as boolean ?? true;

    const agents = agentRegistry.list(filter);

    const response = {
      total_agents: agents.length,
      agents: agents.map(agent => {
        if (includeDetails) {
          return agent;
        }
        return {
          agent_id: agent.agent_id,
          display_name: agent.display_name,
          description: agent.description,
          capabilities: agent.capabilities.map(c => c.name),
          is_default: agent.is_default,
        };
      }),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  },
};

/**
 * rag.route_to_agent - Route query to specialized agent based on intent
 */
export const ragRouteToAgent: RAGTool = {
  name: 'rag.route_to_agent',
  description: 'Route a query to a specialized agent based on intent or capabilities',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The query to route',
      },
      target_agent: {
        type: 'string',
        description: 'Specific agent ID to route to (optional, will auto-select if not provided)',
      },
      intent: {
        type: 'string',
        description: 'Query intent for automatic routing',
      },
      context: {
        type: 'object',
        description: 'Context to pass to the target agent',
        additionalProperties: true,
      },
      return_to_rag: {
        type: 'boolean',
        description: 'Whether to return results back to RAG system',
        default: false,
      },
      async: {
        type: 'boolean',
        description: 'Whether to handle response asynchronously',
        default: false,
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const query = args.query as string;
    const targetAgent = args.target_agent as string | undefined;
    const intent = args.intent as string | undefined;
    const context = args.context as Record<string, unknown> | undefined;
    const returnToRag = args.return_to_rag as boolean ?? false;
    const async_mode = args.async as boolean ?? false;

    // Find target agent
    let agent: AgentInfo | undefined;
    
    if (targetAgent) {
      agent = agentRegistry.get(targetAgent);
      if (!agent) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Agent not found: ${targetAgent}` }, null, 2) }],
          isError: true,
        };
      }
    } else {
      agent = agentRegistry.findBest(query, intent);
      if (!agent) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'No suitable agent found for query' }, null, 2) }],
          isError: true,
        };
      }
    }

    // Generate request ID for tracking
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Simulate agent response (in production, this would call the actual agent endpoint)
    const simulatedResponse = simulateAgentResponse(agent, query, context);

    if (async_mode) {
      // For async, we'd register a callback and return immediately
      return {
        content: [{ 
          type: 'text', 
          text: JSON.stringify({
            request_id: requestId,
            status: 'queued',
            target_agent: agent.agent_id,
            query,
            message: 'Request queued for async processing',
          }, null, 2),
        }],
      };
    }

    // Sync response
    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify({
          request_id: requestId,
          status: 'completed',
          target_agent: agent.agent_id,
          agent_name: agent.display_name,
          query,
          response: simulatedResponse,
          return_to_rag: returnToRag,
        }, null, 2),
      }],
    };
  },
};

/**
 * rag.get_agent_capabilities - Query capabilities of registered agents
 */
export const ragGetAgentCapabilities: RAGTool = {
  name: 'rag.get_agent_capabilities',
  description: 'Query the capabilities of registered agents',
  inputSchema: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Specific agent ID (optional, returns all if not provided)',
      },
      capability_name: {
        type: 'string',
        description: 'Filter by specific capability name',
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const agentId = args.agent_id as string | undefined;
    const capabilityName = args.capability_name as string | undefined;

    let agents: AgentInfo[];
    
    if (agentId) {
      const agent = agentRegistry.get(agentId);
      agents = agent ? [agent] : [];
    } else {
      agents = agentRegistry.list();
    }

    const capabilities = agents.flatMap(agent => {
      let caps = agent.capabilities;
      
      if (capabilityName) {
        caps = caps.filter(c => c.name === capabilityName);
      }
      
      return caps.map(cap => ({
        agent_id: agent.agent_id,
        agent_name: agent.display_name,
        ...cap,
      }));
    });

    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify({
          total_capabilities: capabilities.length,
          capabilities,
        }, null, 2),
      }],
    };
  },
};

/**
 * rag.register_callback - Register callback for async agent responses
 */
export const ragRegisterCallback: RAGTool = {
  name: 'rag.register_callback',
  description: 'Register a callback URL or handler for async agent responses',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['register', 'unregister', 'list'],
        description: 'Action to perform',
      },
      request_id: {
        type: 'string',
        description: 'Request ID for callback (required for unregister)',
      },
      callback_url: {
        type: 'string',
        description: 'URL to send callback to (required for register)',
      },
    },
    required: ['action'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const action = args.action as string;

    switch (action) {
      case 'register': {
        const requestId = args.request_id as string;
        const callbackUrl = args.callback_url as string;
        
        if (!requestId || !callbackUrl) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'request_id and callback_url are required' }, null, 2) }],
            isError: true,
          };
        }

        try { new URL(callbackUrl); } catch { return { content: [{ type: 'text', text: JSON.stringify({ error: 'callback_url must be a valid URL' }) }], isError: true }; }

        // In production, this would store the callback URL
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              success: true,
              message: 'Callback registered',
              request_id: requestId,
              callback_url: callbackUrl,
            }, null, 2),
          }],
        };
      }

      case 'unregister': {
        const requestId = args.request_id as string;
        
        if (!requestId) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'request_id is required' }, null, 2) }],
            isError: true,
          };
        }

        agentRegistry.removeCallback(requestId);
        
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              success: true,
              message: 'Callback unregistered',
              request_id: requestId,
            }, null, 2),
          }],
        };
      }

      case 'list': {
        // Return registered callbacks (simplified)
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              message: 'Callback listing not implemented in demo mode',
            }, null, 2),
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown action: ${action}` }, null, 2) }],
          isError: true,
        };
    }
  },
};

/**
 * Simulate agent response based on agent type
 */
function simulateAgentResponse(agent: AgentInfo, query: string, context?: Record<string, unknown>): unknown {
  // In production, this would make an actual API call to the agent
  switch (agent.agent_id) {
    case 'calculator':
      return {
        message: `Calculator agent would process: ${  query}`,
        note: 'This is a simulated response',
      };
    
    case 'data-analyst':
      return {
        message: `Data analyst agent would analyze: ${  query}`,
        note: 'This is a simulated response',
      };
    
    case 'hybrid-rag-qdrant':
      return {
        message: `RAG agent would search for: ${  query}`,
        note: 'This is a simulated response',
      };
    
    default:
      return {
        message: `Agent ${agent.display_name} received: ${query}`,
        context,
        note: 'This is a simulated response',
      };
  }
}

export const agentIntegrationTools: RAGTool[] = [
  ragDiscoverAgents,
  ragRouteToAgent,
  ragGetAgentCapabilities,
  ragRegisterCallback,
];

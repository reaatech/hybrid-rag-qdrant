/**
 * MCP Server implementation for hybrid-rag-qdrant
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getLogger } from '../observability/logger.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

const logger = getLogger();
import type { RAGPipeline } from './types.js';
import { retrievalTools } from './tools/retrieval.js';
import { ingestionTools } from './tools/ingestion.js';
import { evaluationTools } from './tools/evaluation.js';
import { adminTools } from './tools/admin.js';
import { queryAnalysisTools } from './tools/query-analysis.js';
import { sessionManagementTools } from './tools/session-management.js';
import { agentIntegrationTools } from './tools/agent-integration.js';
import { costManagementTools } from './tools/cost-management.js';
import { qualityTools } from './tools/quality-tools.js';
import { observabilityTools } from './tools/observability-tools.js';

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  /** RAG Pipeline instance */
  pipeline: RAGPipeline;
  /** Server name */
  name?: string;
  /** Server version */
  version?: string;
}

/**
 * MCP Server for hybrid-rag-qdrant
 */
export class MCPServer {
  private readonly server: Server;
  private readonly pipeline: RAGPipeline;

  constructor(config: MCPServerConfig) {
    this.pipeline = config.pipeline;

    this.server = new Server(
      {
        name: config.name ?? 'hybrid-rag-qdrant',
        version: config.version ?? '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
  }

  /**
   * Set up tool request handlers
   */
  private setupToolHandlers(): void {
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          ...retrievalTools,
          ...ingestionTools,
          ...evaluationTools,
          ...adminTools,
          ...queryAnalysisTools,
          ...sessionManagementTools,
          ...agentIntegrationTools,
          ...costManagementTools,
          ...qualityTools,
          ...observabilityTools,
        ],
      };
    });

    // Build a map of all tools for efficient lookup
    const allTools = [
      ...retrievalTools,
      ...ingestionTools,
      ...evaluationTools,
      ...adminTools,
      ...queryAnalysisTools,
      ...sessionManagementTools,
      ...agentIntegrationTools,
      ...costManagementTools,
      ...qualityTools,
      ...observabilityTools,
    ];

    const toolMap = new Map(allTools.map((t) => [t.name, t]));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = toolMap.get(name);
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        return await tool.handler(args ?? {}, this.pipeline);
      } catch (_error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Internal error' }) }],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server started');
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    await this.server.close();
    await this.pipeline.close();
  }
}

/**
 * Create and start an MCP server
 */
export async function createMCPServer(pipeline: RAGPipeline): Promise<MCPServer> {
  const server = new MCPServer({ pipeline });
  await server.start();
  return server;
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { getLogger } from '@reaatech/hybrid-rag-observability';

const logger = getLogger();

import { adminTools, sandboxTools } from './tools/admin.js';
import { agentIntegrationTools } from './tools/agent-integration.js';
import { costManagementTools } from './tools/cost-management.js';
import { evaluationTools } from './tools/evaluation.js';
import { ingestionTools } from './tools/ingestion.js';
import { migrationTools } from './tools/migration.js';
import { observabilityTools } from './tools/observability-tools.js';
import { qualityTools } from './tools/quality-tools.js';
import { queryAnalysisTools } from './tools/query-analysis.js';
import { retrievalTools } from './tools/retrieval.js';
import { sessionManagementTools } from './tools/session-management.js';
import type { RAGPipeline } from './types.js';

export interface MCPServerConfig {
  pipeline: RAGPipeline;
  name?: string;
  version?: string;
}

export class MCPServer {
  private readonly server: Server;
  private readonly pipeline: RAGPipeline;

  constructor(config: MCPServerConfig) {
    this.pipeline = config.pipeline;

    this.server = new Server(
      {
        name: config.name ?? 'hybrid-rag',
        version: config.version ?? '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          ...retrievalTools,
          ...ingestionTools,
          ...evaluationTools,
          ...adminTools,
          ...sandboxTools,
          ...queryAnalysisTools,
          ...sessionManagementTools,
          ...agentIntegrationTools,
          ...costManagementTools,
          ...qualityTools,
          ...observabilityTools,
          ...migrationTools,
        ],
      };
    });

    const allTools = [
      ...retrievalTools,
      ...ingestionTools,
      ...evaluationTools,
      ...adminTools,
      ...sandboxTools,
      ...queryAnalysisTools,
      ...sessionManagementTools,
      ...agentIntegrationTools,
      ...costManagementTools,
      ...qualityTools,
      ...observabilityTools,
      ...migrationTools,
    ];

    const toolMap = new Map(allTools.map((t) => [t.name, t]));

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

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server started');
  }

  async stop(): Promise<void> {
    await this.server.close();
    await this.pipeline.close();
  }
}

export async function createMCPServer(pipeline: RAGPipeline): Promise<MCPServer> {
  const server = new MCPServer({ pipeline });
  await server.start();
  return server;
}

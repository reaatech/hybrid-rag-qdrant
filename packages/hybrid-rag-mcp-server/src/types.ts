/**
 * MCP Server types
 */

import type { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';
import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';

export type { RAGPipeline };

export type ToolHandler = (
  args: Record<string, unknown>,
  pipeline: RAGPipeline,
) => Promise<{
  content: Array<{ type: string; text: string; isError?: boolean }>;
}>;

export interface RAGTool extends MCPTool {
  handler: ToolHandler;
}

export interface MCPServerConfig {
  pipeline: RAGPipeline;
  name?: string;
  version?: string;
}

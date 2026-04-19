/**
 * MCP Admin Tools
 */

import type { RAGTool } from '../../mcp-server/types.js';
import type { RAGPipeline } from '../../pipeline.js';

/**
 * rag.status - Get system status
 */
export const ragStatus: RAGTool = {
  name: 'rag.status',
  description: 'Get system status and statistics',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_args: Record<string, unknown>, pipeline: RAGPipeline) => {
    try {
      const stats = await pipeline.getStats();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'healthy',
              timestamp: new Date().toISOString(),
              ...stats,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
};

/**
 * rag.collections - List/manage Qdrant collections
 */
export const ragCollections: RAGTool = {
  name: 'rag.collections',
  description: 'List or manage Qdrant collections',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'info', 'delete'],
        description: 'Action to perform',
        default: 'list',
      },
      collectionName: {
        type: 'string',
        description: 'Collection name (required for info/delete)',
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Collections management tool',
            action: args.action,
            collectionName: args.collectionName,
          }, null, 2),
        },
      ],
    };
  },
};

/**
 * rag.config - Get/set configuration
 */
export const ragConfig: RAGTool = {
  name: 'rag.config',
  description: 'Get or set pipeline configuration',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'set'],
        description: 'Action to perform',
        default: 'get',
      },
      key: {
        type: 'string',
        description: 'Configuration key (for get/set)',
      },
      value: {
        type: 'string',
        description: 'Configuration value (for set)',
      },
    },
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Configuration management tool',
            action: args.action,
            key: args.key,
            value: args.value,
          }, null, 2),
        },
      ],
    };
  },
};

export const adminTools: RAGTool[] = [
  ragStatus,
  ragCollections,
  ragConfig,
];

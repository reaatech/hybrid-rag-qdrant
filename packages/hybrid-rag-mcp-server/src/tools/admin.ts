import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';
import type { RAGTool } from '../types.js';

type PipelineVectorStoreMethods = RAGPipeline & {
  getVectorStoreStats?: () => Promise<Record<string, unknown> | null>;
  getVectorStoreCapabilities?: () => Promise<Record<string, unknown> | null>;
  getVectorStoreReadiness?: () => Promise<Record<string, unknown>>;
  getVectorStoreHealth?: () => Promise<boolean>;
};

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
            text: JSON.stringify(
              {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                ...stats,
              },
              null,
              2,
            ),
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

export const ragCollections: RAGTool = {
  name: 'rag.collections',
  description: 'List or manage vector database collections',
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
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    try {
      const action = (args.action as string) ?? 'list';
      const collectionName = args.collectionName as string | undefined;

      if (action === 'delete' && !collectionName) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'collectionName is required for delete action' }),
            },
          ],
          isError: true,
        };
      }

      if (action === 'info' && !collectionName) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'collectionName is required for info action' }),
            },
          ],
          isError: true,
        };
      }

      if (action === 'list') {
        const stats = await pipeline.getStats();
        const healthy = await pipeline.getVectorStoreHealth();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  action,
                  provider: (await pipeline.getVectorStoreReadiness()).provider,
                  healthy,
                  collections: stats.vectorStores.map((store) => ({
                    name: store.collectionName,
                    vectorCount: store.vectorCount,
                    vectorDimension: store.vectorDimension,
                    indexType: store.indexType,
                    diskUsageBytes: store.diskUsageBytes,
                  })),
                  collectionName: collectionName ?? stats.collectionName,
                  totalChunks: stats.totalChunks,
                  totalDocuments: stats.totalDocuments,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === 'info') {
        if (!collectionName) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'collectionName is required for info action' }),
              },
            ],
            isError: true,
          };
        }
        const pipelineWithStats = pipeline as PipelineVectorStoreMethods;
        const capabilities = await pipelineWithStats.getVectorStoreCapabilities?.();
        const readiness = await pipelineWithStats.getVectorStoreReadiness?.();
        const stats = await pipelineWithStats.getVectorStoreStats?.();
        if (stats && stats.collectionName !== collectionName) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Collection '${collectionName}' was not found in the configured vector database`,
                  availableCollection: stats.collectionName,
                  provider: readiness?.provider ?? 'unknown',
                }),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  action,
                  collectionName,
                  provider: readiness?.provider,
                  capabilities,
                  readiness,
                  stats,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (action === 'delete') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  action,
                  message:
                    'Collection deletion requires direct database access. Use your vector database admin console or CLI.',
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown action: ${action}` }),
          },
        ],
        isError: true,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  },
};

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
          text: JSON.stringify(
            {
              message: 'Configuration management tool',
              action: args.action,
              key: args.key,
              value: args.value,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const ragDetectCapabilities: RAGTool = {
  name: 'rag.detect_capabilities',
  description: 'Query the configured vector database for supported features',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: 'Optional provider override to inspect' },
    },
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    try {
      const pipelineAny = pipeline as unknown as Record<string, unknown>;
      let capabilities: Record<string, unknown> | null = null;
      let stats: Record<string, unknown> | null = null;
      let provider = args.provider as string | undefined;

      if (typeof pipelineAny.getVectorStoreCapabilities === 'function') {
        const caps = await (
          pipelineAny.getVectorStoreCapabilities as () => Promise<Record<string, unknown>>
        )();
        capabilities = caps ?? null;
      }

      if (typeof pipelineAny.getVectorStoreStats === 'function') {
        const st = await (
          pipelineAny.getVectorStoreStats as () => Promise<Record<string, unknown>>
        )();
        stats = st ?? null;
      }

      if (!provider && capabilities) {
        provider = (capabilities as Record<string, unknown>).provider as string;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                provider: provider ?? 'unknown',
                capabilities: capabilities ?? {},
                stats: stats ?? {},
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  },
};

export const ragListProviders: RAGTool = {
  name: 'rag.list_providers',
  description: 'List available and registered vector database adapters',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    let registered: string[] = [];
    try {
      const modName = '@reaatech/hybrid-rag-retrieval';
      const mod = (await import(modName)) as { getRegisteredProviders?: () => string[] };
      registered = mod?.getRegisteredProviders?.() ?? [];
    } catch {
      registered = [];
    }

    const builtIn = [
      'qdrant',
      'pinecone',
      'weaviate',
      'chroma',
      'pgvector',
      'milvus',
      'elasticsearch',
      'opensearch',
      'redis',
      'mongodb',
      'azure-ai-search',
      'lancedb',
      'vespa',
      'supabase',
      'sandbox',
    ];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ registered, builtIn }, null, 2),
        },
      ],
    };
  },
};

export const ragSandbox: RAGTool = {
  name: 'rag.sandbox',
  description:
    'Execute a sandbox/dry-run retrieval without hitting a real database (returns mock results using in-memory vector store)',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Test query to run against the sandbox store' },
      topK: { type: 'number', description: 'Number of results (default: 5)' },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const topK = (args.topK as number) ?? 5;
    const results = Array.from({ length: topK }, (_, i) => ({
      chunkId: `sandbox-chunk-${i}`,
      content: `Sandbox result ${i + 1} for query: "${args.query}"`,
      metadata: { source: 'sandbox' },
      score: 1 - i * 0.1,
      source: 'vector' as const,
    }));
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ results, result_count: results.length, mode: 'sandbox' }, null, 2),
        },
      ],
    };
  },
};

export const adminTools: RAGTool[] = [
  ragStatus,
  ragCollections,
  ragConfig,
  ragDetectCapabilities,
  ragListProviders,
];

export const sandboxTools: RAGTool[] = [ragSandbox];

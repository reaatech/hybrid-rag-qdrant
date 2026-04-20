/**
 * MCP Retrieval Tools
 */

import { z } from 'zod';
import type { RAGTool } from '../../mcp-server/types.js';
import type { RAGPipeline } from '../../pipeline.js';
import { validateInput, makeErrorResponse } from '../../mcp-server/validation.js';

const retrieveSchema = z.object({
  query: z.string().min(1, 'query is required'),
  topK: z.number().positive().optional(),
  useReranker: z.boolean().optional(),
  vectorWeight: z.number().min(0).max(1).optional(),
  bm25Weight: z.number().min(0).max(1).optional(),
  filter: z.record(z.unknown()).optional(),
});

const vectorSearchSchema = z.object({
  query: z.string().min(1, 'query is required'),
  topK: z.number().positive().optional(),
  filter: z.record(z.unknown()).optional(),
});

const bm25SearchSchema = z.object({
  query: z.string().min(1, 'query is required'),
  topK: z.number().positive().optional(),
});

const rerankSchema = z.object({
  query: z.string().min(1, 'query is required'),
  documents: z.array(z.string()).min(1, 'documents must be a non-empty array'),
  topK: z.number().positive().optional(),
});

export const ragRetrieve: RAGTool = {
  name: 'rag.retrieve',
  description: 'Execute hybrid retrieval (vector + BM25) with optional reranking',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text' },
      topK: { type: 'number', description: 'Number of results to return', default: 10 },
      useReranker: { type: 'boolean', description: 'Whether to use reranking', default: false },
      vectorWeight: { type: 'number', description: 'Weight for vector search (0-1)', default: 0.7 },
      bm25Weight: { type: 'number', description: 'Weight for BM25 search (0-1)', default: 0.3 },
      filter: { type: 'object', description: 'Metadata filter', additionalProperties: true },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    try {
      const parsed = validateInput(retrieveSchema, args);
      if (!parsed.success) {
        return makeErrorResponse(parsed.error);
      }

      const results = await pipeline.query(parsed.data.query, {
        topK: parsed.data.topK,
        useReranker: parsed.data.useReranker,
        vectorWeight: parsed.data.vectorWeight,
        bm25Weight: parsed.data.bm25Weight,
        filter: parsed.data.filter,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                results: results.map((r) => ({
                  chunkId: r.chunkId,
                  score: r.score,
                  content: r.content,
                  metadata: r.metadata,
                })),
                count: results.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (_error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Retrieval failed' }) }],
        isError: true,
      };
    }
  },
};

export const ragVectorSearch: RAGTool = {
  name: 'rag.vector_search',
  description: 'Execute vector-only semantic search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text' },
      topK: { type: 'number', description: 'Number of results to return', default: 10 },
      filter: { type: 'object', description: 'Metadata filter', additionalProperties: true },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    try {
      const parsed = validateInput(vectorSearchSchema, args);
      if (!parsed.success) {
        return makeErrorResponse(parsed.error);
      }

      const results = await pipeline.query(parsed.data.query, {
        topK: parsed.data.topK,
        vectorWeight: 1,
        bm25Weight: 0,
        filter: parsed.data.filter,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                results: results.map((r) => ({
                  chunkId: r.chunkId,
                  score: r.score,
                  content: r.content,
                  metadata: r.metadata,
                })),
                count: results.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (_error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Retrieval failed' }) }],
        isError: true,
      };
    }
  },
};

export const ragBM25Search: RAGTool = {
  name: 'rag.bm25_search',
  description: 'Execute BM25 keyword-only search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text' },
      topK: { type: 'number', description: 'Number of results to return', default: 10 },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    try {
      const parsed = validateInput(bm25SearchSchema, args);
      if (!parsed.success) {
        return makeErrorResponse(parsed.error);
      }

      const results = await pipeline.query(parsed.data.query, {
        topK: parsed.data.topK,
        vectorWeight: 0,
        bm25Weight: 1,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                results: results.map((r) => ({
                  chunkId: r.chunkId,
                  score: r.score,
                  content: r.content,
                  metadata: r.metadata,
                })),
                count: results.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (_error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Retrieval failed' }) }],
        isError: true,
      };
    }
  },
};

export const ragRerank: RAGTool = {
  name: 'rag.rerank',
  description: 'Rerank existing retrieval results using cross-encoder',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Original query' },
      documents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Document texts to rerank',
      },
      topK: {
        type: 'number',
        description: 'Number of results to return after reranking',
        default: 5,
      },
    },
    required: ['query', 'documents'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const parsed = validateInput(rerankSchema, args);
    if (!parsed.success) {
      return makeErrorResponse(parsed.error);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Reranking not yet implemented in MCP tools',
              query: parsed.data.query,
              documentCount: parsed.data.documents.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const retrievalTools: RAGTool[] = [ragRetrieve, ragVectorSearch, ragBM25Search, ragRerank];

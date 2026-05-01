/**
 * MCP Ingestion Tools
 */

import type { RAGPipeline } from '@reaatech/hybrid-rag-pipeline';
import { z } from 'zod';
import type { RAGTool } from '../types.js';
import { makeErrorResponse, validateInput } from '../validation.js';

const ingestDocumentSchema = z.object({
  id: z.string().min(1, 'id is required'),
  content: z
    .string()
    .min(1, 'content is required')
    .max(10_000_000, 'content exceeds maximum size of 10MB'),
  chunkingStrategy: z.enum(['fixed-size', 'semantic', 'recursive', 'sliding-window']).optional(),
  chunkSize: z.number().positive().optional(),
  overlap: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ingestBatchSchema = z.object({
  documents: z
    .array(
      z.object({
        id: z.string().min(1),
        content: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .min(1, 'documents must be a non-empty array')
    .max(100, 'Batch size cannot exceed 100 documents'),
});

const chunkDocumentSchema = z.object({
  content: z.string().min(1, 'content is required'),
  strategy: z.enum(['fixed-size', 'semantic', 'recursive', 'sliding-window']).optional(),
  chunkSize: z.number().positive().optional(),
  overlap: z.number().nonnegative().optional(),
});

export const ragIngestDocument: RAGTool = {
  name: 'rag.ingest_document',
  description: 'Ingest a single document into the RAG system',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Unique document identifier' },
      content: { type: 'string', description: 'Document content text' },
      chunkingStrategy: {
        type: 'string',
        enum: ['fixed-size', 'semantic', 'recursive', 'sliding-window'],
        description: 'Chunking strategy to use',
        default: 'fixed-size',
      },
      chunkSize: { type: 'number', description: 'Chunk size in tokens', default: 512 },
      overlap: { type: 'number', description: 'Chunk overlap in tokens', default: 50 },
      metadata: { type: 'object', description: 'Document metadata', additionalProperties: true },
    },
    required: ['id', 'content'],
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    try {
      const parsed = validateInput(ingestDocumentSchema, args);
      if (!parsed.success) {
        return makeErrorResponse(parsed.error);
      }

      const chunks = await pipeline.ingest([
        {
          id: parsed.data.id,
          content: parsed.data.content,
          metadata: parsed.data.metadata,
        },
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                documentId: parsed.data.id,
                chunksCreated: chunks.length,
                chunks: chunks.map((c) => ({ chunkId: c.id, size: c.content.length })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (_error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Ingestion failed' }) }],
        isError: true,
      };
    }
  },
};

export const ragIngestBatch: RAGTool = {
  name: 'rag.ingest_batch',
  description: 'Ingest multiple documents in batch',
  inputSchema: {
    type: 'object',
    properties: {
      documents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['id', 'content'],
        },
        description: 'Array of documents to ingest',
      },
    },
    required: ['documents'],
  },
  handler: async (args: Record<string, unknown>, pipeline: RAGPipeline) => {
    try {
      const parsed = validateInput(ingestBatchSchema, args);
      if (!parsed.success) {
        return makeErrorResponse(parsed.error);
      }

      const chunks = await pipeline.ingest(parsed.data.documents);

      const chunksByDoc = new Map<string, number>();
      for (const c of chunks) {
        chunksByDoc.set(c.documentId, (chunksByDoc.get(c.documentId) ?? 0) + 1);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                documentsIngested: parsed.data.documents.length,
                totalChunks: chunks.length,
                chunksPerDocument: parsed.data.documents.map((d) => ({
                  documentId: d.id,
                  chunkCount: chunksByDoc.get(d.id) ?? 0,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (_error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Ingestion failed' }) }],
        isError: true,
      };
    }
  },
};

export const ragChunkDocument: RAGTool = {
  name: 'rag.chunk_document',
  description: 'Preview chunking on a document without indexing',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Document content to chunk' },
      strategy: {
        type: 'string',
        enum: ['fixed-size', 'semantic', 'recursive', 'sliding-window'],
        description: 'Chunking strategy',
        default: 'fixed-size',
      },
      chunkSize: { type: 'number', description: 'Chunk size in tokens', default: 512 },
      overlap: { type: 'number', description: 'Chunk overlap in tokens', default: 50 },
    },
    required: ['content'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const parsed = validateInput(chunkDocumentSchema, args);
    if (!parsed.success) {
      return makeErrorResponse(parsed.error);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Chunking preview not yet implemented in MCP tools',
              strategy: parsed.data.strategy,
              chunkSize: parsed.data.chunkSize,
              contentLength: parsed.data.content.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const ingestionTools: RAGTool[] = [ragIngestDocument, ragIngestBatch, ragChunkDocument];

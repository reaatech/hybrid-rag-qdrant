/**
 * Unit tests for ingestion MCP tools
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ragIngestDocument,
  ragIngestBatch,
  ragChunkDocument,
  ingestionTools,
} from '../../../../src/mcp-server/tools/ingestion.js';
import type { RAGPipeline } from '../../../../src/pipeline.js';

const mockChunks = [
  { id: 'chunk-0', documentId: 'doc-1', content: 'chunk content', metadata: {} },
  { id: 'chunk-1', documentId: 'doc-1', content: 'more content', metadata: {} },
];

const mockPipeline = {
  ingest: vi.fn().mockResolvedValue(mockChunks),
} as unknown as RAGPipeline;

describe('Ingestion Tools', () => {
  describe('Tool definitions', () => {
    it('should have correct tool names', () => {
      expect(ragIngestDocument.name).toBe('rag.ingest_document');
      expect(ragIngestBatch.name).toBe('rag.ingest_batch');
      expect(ragChunkDocument.name).toBe('rag.chunk_document');
    });

    it('should export all tools in array', () => {
      expect(ingestionTools).toHaveLength(3);
    });

    it('should have required inputSchema fields', () => {
      expect((ragIngestDocument.inputSchema as { required: string[] }).required).toContain('id');
      expect((ragIngestDocument.inputSchema as { required: string[] }).required).toContain(
        'content',
      );
      expect((ragIngestBatch.inputSchema as { required: string[] }).required).toContain(
        'documents',
      );
      expect((ragChunkDocument.inputSchema as { required: string[] }).required).toContain(
        'content',
      );
    });
  });

  describe('ragIngestDocument', () => {
    it('should ingest a single document', async () => {
      const result = await ragIngestDocument.handler(
        { id: 'doc-1', content: 'Test document content' },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.documentId).toBe('doc-1');
      expect(response.chunksCreated).toBe(2);
    });

    it('should pass metadata to pipeline', async () => {
      const metadata = { source: 'test', author: 'tester' };
      await ragIngestDocument.handler(
        { id: 'doc-1', content: 'Test content', metadata },
        mockPipeline,
      );

      expect(mockPipeline.ingest).toHaveBeenCalledWith([expect.objectContaining({ metadata })]);
    });

    it('should return error when content is missing', async () => {
      const result = await ragIngestDocument.handler({ id: 'doc-1' }, mockPipeline);

      expect(result.isError).toBe(true);
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.error).toBe('Invalid input');
    });

    it('should return error when content is not a string', async () => {
      const result = await ragIngestDocument.handler({ id: 'doc-1', content: 123 }, mockPipeline);

      expect(result.isError).toBe(true);
    });

    it('should return error when content exceeds 10MB', async () => {
      const result = await ragIngestDocument.handler(
        { id: 'doc-1', content: 'x'.repeat(10_000_001) },
        mockPipeline,
      );

      expect(result.isError).toBe(true);
    });

    it('should accept content at the 10MB boundary', async () => {
      const result = await ragIngestDocument.handler(
        { id: 'doc-1', content: 'x'.repeat(10_000_000) },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
    });

    it('should handle pipeline errors gracefully', async () => {
      const errorPipeline = {
        ingest: vi.fn().mockRejectedValue(new Error('Storage full')),
      } as unknown as RAGPipeline;

      const result = await ragIngestDocument.handler(
        { id: 'doc-1', content: 'test' },
        errorPipeline,
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.error).toBe('Ingestion failed');
    });
  });

  describe('ragIngestBatch', () => {
    it('should ingest multiple documents', async () => {
      const docs = [
        { id: 'doc-a', content: 'Content A' },
        { id: 'doc-b', content: 'Content B' },
      ];

      const multiChunks = [
        { id: 'c-0', documentId: 'doc-a', content: 'chunk a', metadata: {} },
        { id: 'c-1', documentId: 'doc-b', content: 'chunk b', metadata: {} },
      ];
      const batchPipeline = {
        ingest: vi.fn().mockResolvedValue(multiChunks),
      } as unknown as RAGPipeline;

      const result = await ragIngestBatch.handler({ documents: docs }, batchPipeline);

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.documentsIngested).toBe(2);
      expect(response.totalChunks).toBe(2);
    });

    it('should return per-document chunk counts', async () => {
      const docs = [
        { id: 'doc-a', content: 'Content A' },
        { id: 'doc-b', content: 'Content B' },
      ];
      const multiChunks = [
        { id: 'c-0', documentId: 'doc-a', content: 'chunk a1', metadata: {} },
        { id: 'c-1', documentId: 'doc-a', content: 'chunk a2', metadata: {} },
        { id: 'c-2', documentId: 'doc-b', content: 'chunk b1', metadata: {} },
      ];
      const batchPipeline = {
        ingest: vi.fn().mockResolvedValue(multiChunks),
      } as unknown as RAGPipeline;

      const result = await ragIngestBatch.handler({ documents: docs }, batchPipeline);
      const response = JSON.parse((result.content[0] as { text: string }).text);

      const docA = response.chunksPerDocument.find(
        (d: { documentId: string }) => d.documentId === 'doc-a',
      );
      const docB = response.chunksPerDocument.find(
        (d: { documentId: string }) => d.documentId === 'doc-b',
      );
      expect(docA.chunkCount).toBe(2);
      expect(docB.chunkCount).toBe(1);
    });

    it('should return error when documents is not an array', async () => {
      const result = await ragIngestBatch.handler({ documents: 'not-array' }, mockPipeline);

      expect(result.isError).toBe(true);
    });

    it('should return error when documents is empty', async () => {
      const result = await ragIngestBatch.handler({ documents: [] }, mockPipeline);

      expect(result.isError).toBe(true);
    });

    it('should return error when batch exceeds 100 documents', async () => {
      const docs = Array.from({ length: 101 }, (_, i) => ({
        id: `doc-${i}`,
        content: 'content',
      }));

      const result = await ragIngestBatch.handler({ documents: docs }, mockPipeline);

      expect(result.isError).toBe(true);
    });

    it('should accept exactly 100 documents', async () => {
      const docs = Array.from({ length: 100 }, (_, i) => ({
        id: `doc-${i}`,
        content: 'content',
      }));

      const result = await ragIngestBatch.handler({ documents: docs }, mockPipeline);

      expect(result.isError).toBeFalsy();
    });

    it('should handle pipeline errors gracefully', async () => {
      const errorPipeline = {
        ingest: vi.fn().mockRejectedValue(new Error('Network timeout')),
      } as unknown as RAGPipeline;

      const result = await ragIngestBatch.handler(
        { documents: [{ id: 'doc-1', content: 'test' }] },
        errorPipeline,
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('ragChunkDocument', () => {
    it('should return chunking preview', async () => {
      const result = await ragChunkDocument.handler(
        { content: 'Test content for preview' },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.contentLength).toBe('Test content for preview'.length);
    });

    it('should use default strategy when not specified', async () => {
      const result = await ragChunkDocument.handler({ content: 'Test content' }, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.strategy).toBeUndefined();
    });

    it('should pass custom strategy', async () => {
      const result = await ragChunkDocument.handler(
        { content: 'Test', strategy: 'recursive' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.strategy).toBe('recursive');
    });

    it('should pass custom chunkSize', async () => {
      const result = await ragChunkDocument.handler(
        { content: 'Test', chunkSize: 256 },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.chunkSize).toBe(256);
    });

    it('should return error when content is empty', async () => {
      const result = await ragChunkDocument.handler({ content: '' }, mockPipeline);

      expect(result.isError).toBe(true);
    });
  });
});

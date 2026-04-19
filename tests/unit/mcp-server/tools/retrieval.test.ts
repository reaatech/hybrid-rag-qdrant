/**
 * Unit tests for retrieval MCP tools
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ragRetrieve,
  ragVectorSearch,
  ragBM25Search,
  ragRerank,
  retrievalTools,
} from '../../../../src/mcp-server/tools/retrieval.js';
import type { RAGPipeline } from '../../../../src/pipeline.js';

const mockResults = [
  { chunkId: 'chunk-1', score: 0.95, content: 'Result one', metadata: { source: 'doc-a' } },
  { chunkId: 'chunk-2', score: 0.80, content: 'Result two', metadata: { source: 'doc-b' } },
];

const mockPipeline = {
  query: vi.fn().mockResolvedValue(mockResults),
} as unknown as RAGPipeline;

describe('Retrieval Tools', () => {
  describe('Tool definitions', () => {
    it('should have correct tool names', () => {
      expect(ragRetrieve.name).toBe('rag.retrieve');
      expect(ragVectorSearch.name).toBe('rag.vector_search');
      expect(ragBM25Search.name).toBe('rag.bm25_search');
      expect(ragRerank.name).toBe('rag.rerank');
    });

    it('should export all tools in array', () => {
      expect(retrievalTools).toHaveLength(4);
    });

    it('should have required inputSchema fields', () => {
      expect(ragRetrieve.inputSchema).toBeDefined();
      expect((ragRetrieve.inputSchema as { required: string[] }).required).toContain('query');
    });
  });

  describe('ragRetrieve', () => {
    it('should return results for a valid query', async () => {
      const result = await ragRetrieve.handler({ query: 'test query' }, mockPipeline);

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.results).toHaveLength(2);
      expect(response.count).toBe(2);
      expect(response.results[0].chunkId).toBe('chunk-1');
    });

    it('should pass topK option to pipeline.query', async () => {
      await ragRetrieve.handler({ query: 'test', topK: 5 }, mockPipeline);

      expect(mockPipeline.query).toHaveBeenCalledWith('test', expect.objectContaining({ topK: 5 }));
    });

    it('should pass useReranker option to pipeline.query', async () => {
      await ragRetrieve.handler({ query: 'test', useReranker: true }, mockPipeline);

      expect(mockPipeline.query).toHaveBeenCalledWith('test', expect.objectContaining({ useReranker: true }));
    });

    it('should pass vector and bm25 weights', async () => {
      await ragRetrieve.handler(
        { query: 'test', vectorWeight: 0.8, bm25Weight: 0.2 },
        mockPipeline,
      );

      expect(mockPipeline.query).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ vectorWeight: 0.8, bm25Weight: 0.2 }),
      );
    });

    it('should pass filter option', async () => {
      const filter = { department: 'engineering' };
      await ragRetrieve.handler({ query: 'test', filter }, mockPipeline);

      expect(mockPipeline.query).toHaveBeenCalledWith('test', expect.objectContaining({ filter }));
    });

    it('should return error when query is missing', async () => {
      const result = await ragRetrieve.handler({}, mockPipeline);

      expect(result.isError).toBe(true);
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.error).toBe('Invalid input');
      expect(response.details).toBeDefined();
    });

    it('should return error when query is not a string', async () => {
      const result = await ragRetrieve.handler({ query: 123 }, mockPipeline);

      expect(result.isError).toBe(true);
    });

    it('should return error when topK is not positive', async () => {
      const result = await ragRetrieve.handler({ query: 'test', topK: -1 }, mockPipeline);

      expect(result.isError).toBe(true);
    });

    it('should return error when topK is zero', async () => {
      const result = await ragRetrieve.handler({ query: 'test', topK: 0 }, mockPipeline);

      expect(result.isError).toBe(true);
    });

    it('should handle pipeline errors gracefully', async () => {
      const errorPipeline = {
        query: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      } as unknown as RAGPipeline;

      const result = await ragRetrieve.handler({ query: 'test' }, errorPipeline);

      expect(result.isError).toBe(true);
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.error).toBe('Retrieval failed');
    });
  });

  describe('ragVectorSearch', () => {
    it('should return vector-only results', async () => {
      const result = await ragVectorSearch.handler({ query: 'semantic search' }, mockPipeline);

      expect(result.isError).toBeFalsy();
      expect(mockPipeline.query).toHaveBeenCalledWith(
        'semantic search',
        expect.objectContaining({ vectorWeight: 1, bm25Weight: 0 }),
      );
    });

    it('should pass topK option', async () => {
      await ragVectorSearch.handler({ query: 'test', topK: 3 }, mockPipeline);

      expect(mockPipeline.query).toHaveBeenCalledWith('test', expect.objectContaining({ topK: 3 }));
    });

    it('should pass filter option', async () => {
      const filter = { category: 'tech' };
      await ragVectorSearch.handler({ query: 'test', filter }, mockPipeline);

      expect(mockPipeline.query).toHaveBeenCalledWith('test', expect.objectContaining({ filter }));
    });

    it('should handle pipeline errors gracefully', async () => {
      const errorPipeline = {
        query: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      } as unknown as RAGPipeline;

      const result = await ragVectorSearch.handler({ query: 'test' }, errorPipeline);

      expect(result.isError).toBe(true);
    });
  });

  describe('ragBM25Search', () => {
    it('should return BM25-only results', async () => {
      const result = await ragBM25Search.handler({ query: 'keyword search' }, mockPipeline);

      expect(result.isError).toBeFalsy();
      expect(mockPipeline.query).toHaveBeenCalledWith(
        'keyword search',
        expect.objectContaining({ vectorWeight: 0, bm25Weight: 1 }),
      );
    });

    it('should pass topK option', async () => {
      await ragBM25Search.handler({ query: 'test', topK: 5 }, mockPipeline);

      expect(mockPipeline.query).toHaveBeenCalledWith('test', expect.objectContaining({ topK: 5 }));
    });

    it('should handle pipeline errors gracefully', async () => {
      const errorPipeline = {
        query: vi.fn().mockRejectedValue(new Error('BM25 index corrupted')),
      } as unknown as RAGPipeline;

      const result = await ragBM25Search.handler({ query: 'test' }, errorPipeline);

      expect(result.isError).toBe(true);
    });
  });

  describe('ragRerank', () => {
    it('should return rerank response', async () => {
      const result = await ragRerank.handler(
        { query: 'test', documents: ['doc one', 'doc two'] },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.query).toBe('test');
      expect(response.documentCount).toBe(2);
    });

    it('should return error when documents is empty', async () => {
      const result = await ragRerank.handler(
        { query: 'test', documents: [] },
        mockPipeline,
      );

      expect(result.isError).toBe(true);
    });

    it('should return error when documents is missing', async () => {
      const result = await ragRerank.handler({ query: 'test' }, mockPipeline);

      expect(result.isError).toBe(true);
    });

    it('should return error when query is missing', async () => {
      const result = await ragRerank.handler(
        { documents: ['doc one'] },
        mockPipeline,
      );

      expect(result.isError).toBe(true);
    });
  });
});

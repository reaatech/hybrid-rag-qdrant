/**
 * Unit tests for admin MCP tools
 */

import { describe, it, expect } from 'vitest';
import {
  ragStatus,
  ragCollections,
  ragConfig,
  adminTools,
} from '../../../../src/mcp-server/tools/admin.js';
import type { RAGPipeline } from '../../../../src/pipeline.js';

const mockPipeline = {
  getStats: async () => ({
    totalQueries: 1000,
    activeSessions: 5,
    documentsIndexed: 5000,
    chunksIndexed: 25000,
  }),
} as unknown as RAGPipeline;

describe('Admin Tools', () => {
  describe('Tool definitions', () => {
    it('should have correct tool names', () => {
      expect(ragStatus.name).toBe('rag.status');
      expect(ragCollections.name).toBe('rag.collections');
      expect(ragConfig.name).toBe('rag.config');
    });

    it('should export all tools in array', () => {
      expect(adminTools).toHaveLength(3);
    });
  });

  describe('ragStatus', () => {
    it('should return healthy status with stats', async () => {
      const result = await ragStatus.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.status).toBe('healthy');
      expect(response.totalQueries).toBe(1000);
      expect(response.activeSessions).toBe(5);
    });

    it('should include timestamp', async () => {
      const result = await ragStatus.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.timestamp).toBeDefined();
    });

    it('should handle pipeline errors gracefully', async () => {
      const errorPipeline = {
        getStats: async () => {
          throw new Error('Database connection failed');
        },
      } as unknown as RAGPipeline;

      const result = await ragStatus.handler({}, errorPipeline);

      expect(result.isError).toBe(true);
    });
  });

  describe('ragCollections', () => {
    it('should return undefined action when not provided', async () => {
      const result = await ragCollections.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.action).toBeUndefined();
    });

    it('should get info for specific collection', async () => {
      const result = await ragCollections.handler(
        { action: 'info', collectionName: 'my-collection' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.action).toBe('info');
      expect(response.collectionName).toBe('my-collection');
    });

    it('should delete a collection', async () => {
      const result = await ragCollections.handler(
        { action: 'delete', collectionName: 'old-collection' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.action).toBe('delete');
      expect(response.collectionName).toBe('old-collection');
    });

    it('should handle list action explicitly', async () => {
      const result = await ragCollections.handler({ action: 'list' }, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.action).toBe('list');
    });
  });

  describe('ragConfig', () => {
    it('should return undefined action when not provided', async () => {
      const result = await ragConfig.handler({}, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.action).toBeUndefined();
    });

    it('should get specific config key', async () => {
      const result = await ragConfig.handler({ action: 'get', key: 'topK' }, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.action).toBe('get');
      expect(response.key).toBe('topK');
    });

    it('should set config value', async () => {
      const result = await ragConfig.handler(
        { action: 'set', key: 'topK', value: '20' },
        mockPipeline,
      );

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.action).toBe('set');
      expect(response.key).toBe('topK');
      expect(response.value).toBe('20');
    });

    it('should handle get action explicitly', async () => {
      const result = await ragConfig.handler({ action: 'get' }, mockPipeline);

      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.action).toBe('get');
    });
  });
});

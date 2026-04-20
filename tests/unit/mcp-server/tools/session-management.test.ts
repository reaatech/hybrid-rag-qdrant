/**
 * Unit tests for session management MCP tools
 */

import { describe, it, expect } from 'vitest';
import {
  ragSessionManage,
  ragGetContext,
  ragSessionHistory,
  sessionManagementTools,
} from '../../../../src/mcp-server/tools/session-management.js';
import type { RAGPipeline } from '../../../../src/pipeline.js';

// Mock RAGPipeline
const mockPipeline = {} as RAGPipeline;

describe('Session Management Tools', () => {
  describe('Tool definitions', () => {
    it('should have correct tool names', () => {
      expect(ragSessionManage.name).toBe('rag.session_manage');
      expect(ragGetContext.name).toBe('rag.get_context');
      expect(ragSessionHistory.name).toBe('rag.session_history');
    });

    it('should have valid input schemas', () => {
      expect(ragSessionManage.inputSchema).toBeDefined();
      expect(ragGetContext.inputSchema).toBeDefined();
      expect(ragSessionHistory.inputSchema).toBeDefined();
    });

    it('should export all tools in array', () => {
      expect(sessionManagementTools).toHaveLength(3);
      expect(sessionManagementTools).toContain(ragSessionManage);
      expect(sessionManagementTools).toContain(ragGetContext);
      expect(sessionManagementTools).toContain(ragSessionHistory);
    });
  });

  describe('ragSessionManage', () => {
    describe('create action', () => {
      it('should create session with user_id', async () => {
        const result = await ragSessionManage.handler(
          { action: 'create', user_id: 'user-123' },
          mockPipeline,
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.success).toBe(true);
        expect(response.session.userId).toBe('user-123');
        expect(response.session.id).toBeDefined();
      });

      it('should create session with metadata', async () => {
        const result = await ragSessionManage.handler(
          {
            action: 'create',
            user_id: 'user-123',
            metadata: { domain: 'tech', priority: 'high' },
          },
          mockPipeline,
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.session.metadata.domain).toBe('tech');
        expect(response.session.metadata.priority).toBe('high');
      });

      it('should fail without user_id', async () => {
        const result = await ragSessionManage.handler({ action: 'create' }, mockPipeline);

        expect(result.isError).toBe(true);
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.error).toContain('user_id is required');
      });
    });

    describe('get action', () => {
      it('should get existing session', async () => {
        // First create a session
        const createResult = await ragSessionManage.handler(
          { action: 'create', user_id: 'user-123' },
          mockPipeline,
        );
        const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

        // Then get it
        const result = await ragSessionManage.handler(
          { action: 'get', session_id: sessionId },
          mockPipeline,
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.session.id).toBe(sessionId);
      });

      it('should fail for non-existent session', async () => {
        const result = await ragSessionManage.handler(
          { action: 'get', session_id: 'non-existent-id' },
          mockPipeline,
        );

        expect(result.isError).toBe(true);
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.error).toBe('Session not found');
      });

      it('should fail without session_id', async () => {
        const result = await ragSessionManage.handler({ action: 'get' }, mockPipeline);

        expect(result.isError).toBe(true);
      });
    });

    describe('update action', () => {
      it('should update session metadata', async () => {
        // Create session
        const createResult = await ragSessionManage.handler(
          { action: 'create', user_id: 'user-123' },
          mockPipeline,
        );
        const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

        // Update it
        const result = await ragSessionManage.handler(
          { action: 'update', session_id: sessionId, metadata: { newField: 'value' } },
          mockPipeline,
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.success).toBe(true);
        expect(response.session.metadata.newField).toBe('value');
      });

      it('should fail without metadata', async () => {
        const createResult = await ragSessionManage.handler(
          { action: 'create', user_id: 'user-123' },
          mockPipeline,
        );
        const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

        const result = await ragSessionManage.handler(
          { action: 'update', session_id: sessionId },
          mockPipeline,
        );

        expect(result.isError).toBe(true);
      });
    });

    describe('delete action', () => {
      it('should delete existing session', async () => {
        // Create session
        const createResult = await ragSessionManage.handler(
          { action: 'create', user_id: 'user-123' },
          mockPipeline,
        );
        const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

        // Delete it
        const result = await ragSessionManage.handler(
          { action: 'delete', session_id: sessionId },
          mockPipeline,
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.success).toBe(true);

        // Verify deleted
        const getResult = await ragSessionManage.handler(
          { action: 'get', session_id: sessionId },
          mockPipeline,
        );
        expect(getResult.isError).toBe(true);
      });

      it('should return success for non-existent session', async () => {
        const result = await ragSessionManage.handler(
          { action: 'delete', session_id: 'non-existent-id' },
          mockPipeline,
        );

        expect(result.isError).toBeFalsy();
      });
    });

    describe('list action', () => {
      it('should list user sessions', async () => {
        // Create multiple sessions
        await ragSessionManage.handler({ action: 'create', user_id: 'user-123' }, mockPipeline);
        await ragSessionManage.handler({ action: 'create', user_id: 'user-123' }, mockPipeline);

        // List them
        const result = await ragSessionManage.handler(
          { action: 'list', user_id: 'user-123' },
          mockPipeline,
        );

        expect(result.isError).toBeFalsy();
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.count).toBeGreaterThanOrEqual(2);
      });

      it('should fail without user_id', async () => {
        const result = await ragSessionManage.handler({ action: 'list' }, mockPipeline);

        expect(result.isError).toBe(true);
      });
    });

    describe('unknown action', () => {
      it('should return error for unknown action', async () => {
        const result = await ragSessionManage.handler({ action: 'unknown' }, mockPipeline);

        expect(result.isError).toBe(true);
        const response = JSON.parse((result.content[0] as { text: string }).text);
        expect(response.error).toContain('Unknown action');
      });
    });
  });

  describe('ragGetContext', () => {
    it('should get session context', async () => {
      // Create session
      const createResult = await ragSessionManage.handler(
        { action: 'create', user_id: 'user-123' },
        mockPipeline,
      );
      const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

      // Get context
      const result = await ragGetContext.handler({ session_id: sessionId }, mockPipeline);

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.session_id).toBe(sessionId);
      expect(response.user_id).toBe('user-123');
      expect(response.context).toBeDefined();
    });

    it('should include history when requested', async () => {
      // Create session
      const createResult = await ragSessionManage.handler(
        { action: 'create', user_id: 'user-123' },
        mockPipeline,
      );
      const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

      // Get context with history
      const result = await ragGetContext.handler(
        { session_id: sessionId, include_history: true },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.recent_history).toBeDefined();
    });

    it('should respect max_history parameter', async () => {
      // Create session
      const createResult = await ragSessionManage.handler(
        { action: 'create', user_id: 'user-123' },
        mockPipeline,
      );
      const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

      // Get context with max_history
      const result = await ragGetContext.handler(
        { session_id: sessionId, include_history: true, max_history: 2 },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.recent_history).toHaveLength(0); // No queries yet
    });

    it('should fail for non-existent session', async () => {
      const result = await ragGetContext.handler({ session_id: 'non-existent' }, mockPipeline);

      expect(result.isError).toBe(true);
    });
  });

  describe('ragSessionHistory', () => {
    it('should get session history', async () => {
      // Create session
      const createResult = await ragSessionManage.handler(
        { action: 'create', user_id: 'user-123' },
        mockPipeline,
      );
      const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

      // Get history
      const result = await ragSessionHistory.handler({ session_id: sessionId }, mockPipeline);

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.session_id).toBe(sessionId);
      expect(response.total_queries).toBe(0);
      expect(response.history).toHaveLength(0);
    });

    it('should handle pagination', async () => {
      // Create session
      const createResult = await ragSessionManage.handler(
        { action: 'create', user_id: 'user-123' },
        mockPipeline,
      );
      const sessionId = JSON.parse((createResult.content[0] as { text: string }).text).session.id;

      // Get paginated history
      const result = await ragSessionHistory.handler(
        { session_id: sessionId, limit: 10, offset: 0 },
        mockPipeline,
      );

      expect(result.isError).toBeFalsy();
      const response = JSON.parse((result.content[0] as { text: string }).text);
      expect(response.limit).toBe(10);
      expect(response.offset).toBe(0);
    });

    it('should fail for non-existent session', async () => {
      const result = await ragSessionHistory.handler({ session_id: 'non-existent' }, mockPipeline);

      expect(result.isError).toBe(true);
    });
  });
});

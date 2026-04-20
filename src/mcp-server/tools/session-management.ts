/**
 * MCP Session Management Tools
 *
 * Tools for managing multi-turn conversation context,
 * session lifecycle, and query history tracking.
 */

import { randomUUID } from 'node:crypto';
import type { RAGTool } from '../../mcp-server/types.js';
import type { RAGPipeline } from '../../pipeline.js';

/**
 * Session data structure
 */
export interface SessionData {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  queryHistory: QueryRecord[];
  context: SessionContext;
}

/**
 * Individual query record in session history
 */
export interface QueryRecord {
  queryId: string;
  query: string;
  timestamp: string;
  resultsCount: number;
  intent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Session context for multi-turn conversations
 */
export interface SessionContext {
  domain?: string;
  priority?: string;
  lastQuery?: string;
  lastResults?: string[];
  conversationTopic?: string;
  userPreferences?: Record<string, unknown>;
}

/**
 * Simple in-memory session store
 * In production, this would be backed by a database
 */
class SessionStore {
  private sessions: Map<string, SessionData> = new Map();
  private userSessions: Map<string, string[]> = new Map();

  /**
   * Create a new session
   */
  create(userId: string, metadata?: Record<string, unknown>): SessionData {
    const id = `session-${randomUUID()}`;
    const now = new Date().toISOString();

    const session: SessionData = {
      id,
      userId,
      createdAt: now,
      updatedAt: now,
      metadata: metadata || {},
      queryHistory: [],
      context: {},
    };

    this.sessions.set(id, session);

    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, []);
    }
    this.userSessions.get(userId)!.push(id);

    return session;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): SessionData | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Update a session
   */
  update(sessionId: string, updates: Partial<SessionData>): SessionData | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    Object.assign(session, updates, { updatedAt: new Date().toISOString() });
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Add a query to session history
   */
  addQuery(sessionId: string, record: QueryRecord): SessionData | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.queryHistory.push(record);
    session.updatedAt = new Date().toISOString();

    // Update context with last query
    session.context.lastQuery = record.query;

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get sessions for a user
   */
  getUserSessions(userId: string): SessionData[] {
    const sessionIds = this.userSessions.get(userId) || [];
    return sessionIds
      .map((id) => this.sessions.get(id))
      .filter((s): s is SessionData => s !== undefined);
  }

  /**
   * Delete a session
   */
  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Remove from user sessions
    const userSessions = this.userSessions.get(session.userId) || [];
    const index = userSessions.indexOf(sessionId);
    if (index > -1) {
      userSessions.splice(index, 1);
    }

    return this.sessions.delete(sessionId);
  }

  /**
   * Get session statistics
   */
  getStats(): { totalSessions: number; activeUsers: number } {
    return {
      totalSessions: this.sessions.size,
      activeUsers: this.userSessions.size,
    };
  }
}

// Global session store instance
const sessionStore = new SessionStore();

/**
 * rag.session_manage - Create, update, and manage RAG sessions
 */
export const ragSessionManage: RAGTool = {
  name: 'rag.session_manage',
  description: 'Create, update, and manage RAG conversation sessions for multi-turn interactions',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'get', 'update', 'delete', 'list'],
        description: 'Action to perform on the session',
      },
      session_id: {
        type: 'string',
        description: 'Session ID (required for get, update, delete actions)',
      },
      user_id: {
        type: 'string',
        description: 'User ID (required for create and list actions)',
      },
      metadata: {
        type: 'object',
        description: 'Session metadata',
        additionalProperties: true,
      },
    },
    required: ['action'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const action = args.action as string;

    try {
      switch (action) {
        case 'create': {
          const userId = args.user_id as string;
          if (!userId) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: 'user_id is required for create action' }, null, 2),
                },
              ],
              isError: true,
            };
          }
          const metadata = args.metadata as Record<string, unknown> | undefined;
          const session = sessionStore.create(userId, metadata);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, session }, null, 2) }],
          };
        }

        case 'get': {
          const sessionId = args.session_id as string;
          if (!sessionId) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: 'session_id is required for get action' }, null, 2),
                },
              ],
              isError: true,
            };
          }
          const session = sessionStore.get(sessionId);
          if (!session) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: 'Session not found' }, null, 2) },
              ],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({ session }, null, 2) }],
          };
        }

        case 'update': {
          const sessionId = args.session_id as string;
          if (!sessionId) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    { error: 'session_id is required for update action' },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
          const updates = args.metadata as Record<string, unknown> | undefined;
          if (!updates) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    { error: 'metadata is required for update action' },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
          const session = sessionStore.update(sessionId, { metadata: { ...updates } });
          if (!session) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: 'Session not found' }, null, 2) },
              ],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, session }, null, 2) }],
          };
        }

        case 'delete': {
          const sessionId = args.session_id as string;
          if (!sessionId) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    { error: 'session_id is required for delete action' },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
          const success = sessionStore.delete(sessionId);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success }, null, 2) }],
          };
        }

        case 'list': {
          const userId = args.user_id as string;
          if (!userId) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: 'user_id is required for list action' }, null, 2),
                },
              ],
              isError: true,
            };
          }
          const sessions = sessionStore.getUserSessions(userId);
          return {
            content: [
              { type: 'text', text: JSON.stringify({ sessions, count: sessions.length }, null, 2) },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Unknown action: ${action}` }, null, 2),
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: (error as Error).message }, null, 2) },
        ],
        isError: true,
      };
    }
  },
};

/**
 * rag.get_context - Retrieve conversation context for multi-turn RAG
 */
export const ragGetContext: RAGTool = {
  name: 'rag.get_context',
  description: 'Retrieve conversation context from a session for multi-turn RAG interactions',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'Session ID to retrieve context from',
      },
      include_history: {
        type: 'boolean',
        description: 'Whether to include full query history',
        default: false,
      },
      max_history: {
        type: 'number',
        description: 'Maximum number of recent queries to include',
        default: 5,
      },
    },
    required: ['session_id'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const sessionId = args.session_id as string;
    const includeHistory = (args.include_history as boolean) ?? false;
    const maxHistory = (args.max_history as number) ?? 5;

    const session = sessionStore.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Session not found', session_id: sessionId }, null, 2),
          },
        ],
        isError: true,
      };
    }

    const context = {
      session_id: sessionId,
      user_id: session.userId,
      context: session.context,
      metadata: session.metadata,
    };

    if (includeHistory) {
      const recentHistory = session.queryHistory.slice(-maxHistory);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...context,
                recent_history: recentHistory,
                total_queries: session.queryHistory.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(context, null, 2) }],
    };
  },
};

/**
 * rag.session_history - Retrieve session query history
 */
export const ragSessionHistory: RAGTool = {
  name: 'rag.session_history',
  description: 'Retrieve query history for a specific session',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'Session ID to retrieve history from',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of queries to return',
        default: 20,
      },
      offset: {
        type: 'number',
        description: 'Number of queries to skip (for pagination)',
        default: 0,
      },
    },
    required: ['session_id'],
  },
  handler: async (args: Record<string, unknown>, _pipeline: RAGPipeline) => {
    const sessionId = args.session_id as string;
    const limit = (args.limit as number) ?? 20;
    const offset = (args.offset as number) ?? 0;

    const session = sessionStore.get(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Session not found', session_id: sessionId }, null, 2),
          },
        ],
        isError: true,
      };
    }

    const paginatedHistory = session.queryHistory.slice(offset, offset + limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              session_id: sessionId,
              total_queries: session.queryHistory.length,
              returned: paginatedHistory.length,
              offset,
              limit,
              history: paginatedHistory,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const sessionManagementTools: RAGTool[] = [
  ragSessionManage,
  ragGetContext,
  ragSessionHistory,
];

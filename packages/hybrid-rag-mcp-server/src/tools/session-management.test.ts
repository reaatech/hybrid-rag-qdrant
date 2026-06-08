import { describe, expect, it } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  ragGetContext,
  ragSessionHistory,
  ragSessionManage,
  sessionManagementTools,
} from './session-management.js';

const pipeline = makePipeline({});

async function createSession(userId: string, metadata?: Record<string, unknown>) {
  const res = await ragSessionManage.handler(
    { action: 'create', user_id: userId, metadata },
    pipeline,
  );
  return (parseToolResult(res).session as { id: string }).id;
}

describe('sessionManagementTools registry', () => {
  it('exports three tools', () => {
    expect(sessionManagementTools.map((t) => t.name)).toEqual([
      'rag.session_manage',
      'rag.get_context',
      'rag.session_history',
    ]);
  });
});

describe('rag.session_manage', () => {
  it('creates a session', async () => {
    const res = await ragSessionManage.handler(
      { action: 'create', user_id: 'u1', metadata: { foo: 'bar' } },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.success).toBe(true);
    expect((payload.session as { userId: string }).userId).toBe('u1');
  });

  it('requires user_id for create', async () => {
    const res = await ragSessionManage.handler({ action: 'create' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('user_id');
  });

  it('gets an existing session', async () => {
    const id = await createSession('u2');
    const res = await ragSessionManage.handler({ action: 'get', session_id: id }, pipeline);
    expect((parseToolResult(res).session as { id: string }).id).toBe(id);
  });

  it('requires session_id for get', async () => {
    const res = await ragSessionManage.handler({ action: 'get' }, pipeline);
    expect(res.isError).toBe(true);
  });

  it('returns not found for a missing session on get', async () => {
    const res = await ragSessionManage.handler({ action: 'get', session_id: 'nope' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Session not found');
  });

  it('updates a session', async () => {
    const id = await createSession('u3');
    const res = await ragSessionManage.handler(
      { action: 'update', session_id: id, metadata: { tier: 'pro' } },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.success).toBe(true);
    expect((payload.session as { metadata: Record<string, unknown> }).metadata).toEqual({
      tier: 'pro',
    });
  });

  it('requires session_id for update', async () => {
    const res = await ragSessionManage.handler({ action: 'update', metadata: { a: 1 } }, pipeline);
    expect(res.isError).toBe(true);
  });

  it('requires metadata for update', async () => {
    const id = await createSession('u3b');
    const res = await ragSessionManage.handler({ action: 'update', session_id: id }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('metadata');
  });

  it('returns not found when updating a missing session', async () => {
    const res = await ragSessionManage.handler(
      { action: 'update', session_id: 'nope', metadata: { a: 1 } },
      pipeline,
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Session not found');
  });

  it('deletes a session', async () => {
    const id = await createSession('u4');
    const res = await ragSessionManage.handler({ action: 'delete', session_id: id }, pipeline);
    expect(parseToolResult(res).success).toBe(true);
  });

  it('requires session_id for delete', async () => {
    const res = await ragSessionManage.handler({ action: 'delete' }, pipeline);
    expect(res.isError).toBe(true);
  });

  it('lists sessions for a user', async () => {
    await createSession('u5');
    await createSession('u5');
    const res = await ragSessionManage.handler({ action: 'list', user_id: 'u5' }, pipeline);
    expect(parseToolResult(res).count).toBe(2);
  });

  it('requires user_id for list', async () => {
    const res = await ragSessionManage.handler({ action: 'list' }, pipeline);
    expect(res.isError).toBe(true);
  });

  it('errors on an unknown action', async () => {
    const res = await ragSessionManage.handler({ action: 'frob' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('Unknown action');
  });
});

describe('rag.get_context', () => {
  it('returns context without history by default', async () => {
    const id = await createSession('ctx1', { region: 'us' });
    const res = await ragGetContext.handler({ session_id: id }, pipeline);
    const payload = parseToolResult(res);
    expect(payload.session_id).toBe(id);
    expect(payload.user_id).toBe('ctx1');
    expect(payload.recent_history).toBeUndefined();
  });

  it('includes history when requested', async () => {
    const id = await createSession('ctx2');
    const res = await ragGetContext.handler(
      { session_id: id, include_history: true, max_history: 3 },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.recent_history).toEqual([]);
    expect(payload.total_queries).toBe(0);
  });

  it('returns not found for a missing session', async () => {
    const res = await ragGetContext.handler({ session_id: 'nope' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Session not found');
  });
});

describe('rag.session_history', () => {
  it('returns paginated (empty) history for a new session', async () => {
    const id = await createSession('hist1');
    const res = await ragSessionHistory.handler({ session_id: id, limit: 5, offset: 0 }, pipeline);
    const payload = parseToolResult(res);
    expect(payload.session_id).toBe(id);
    expect(payload.total_queries).toBe(0);
    expect(payload.returned).toBe(0);
  });

  it('returns not found for a missing session', async () => {
    const res = await ragSessionHistory.handler({ session_id: 'nope' }, pipeline);
    expect(res.isError).toBe(true);
  });
});

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMCPServer, MCPServer } from './mcp-server.js';
import { makePipeline } from './test-helpers.js';
import { retrievalTools } from './tools/retrieval.js';

// Capture registered request handlers and stub the transport/connect lifecycle.
const { handlers, connect, close } = vi.hoisted(() => ({
  handlers: new Map<unknown, (req: unknown) => Promise<unknown>>(),
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    setRequestHandler(schema: unknown, handler: (req: unknown) => Promise<unknown>) {
      handlers.set(schema, handler);
    }
    connect = connect;
    close = close;
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));

vi.mock('@reaatech/hybrid-rag-observability', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

beforeEach(() => {
  handlers.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('MCPServer', () => {
  it('registers list and call tool handlers on construction', () => {
    new MCPServer({ pipeline: makePipeline({}) });
    expect(handlers.has(ListToolsRequestSchema)).toBe(true);
    expect(handlers.has(CallToolRequestSchema)).toBe(true);
  });

  it('uses default name and version when not provided', () => {
    const server = new MCPServer({ pipeline: makePipeline({}) });
    expect(server).toBeInstanceOf(MCPServer);
  });

  it('lists all aggregated tools', async () => {
    new MCPServer({ pipeline: makePipeline({}) });
    const listHandler = handlers.get(ListToolsRequestSchema)!;
    const result = (await listHandler({})) as { tools: Array<{ name: string }> };
    expect(result.tools.length).toBeGreaterThan(40);
    expect(result.tools.map((t) => t.name)).toContain('rag.retrieve');
    expect(result.tools.map((t) => t.name)).toContain('rag.migrate');
  });

  it('dispatches a known tool call to its handler', async () => {
    const query = vi.fn().mockResolvedValue([]);
    new MCPServer({ pipeline: makePipeline({ query }) });
    const callHandler = handlers.get(CallToolRequestSchema)!;
    const result = (await callHandler({
      params: { name: 'rag.retrieve', arguments: { query: 'hi' } },
    })) as { content: unknown[] };
    expect(result.content).toBeDefined();
    expect(query).toHaveBeenCalled();
  });

  it('defaults missing arguments to an empty object', async () => {
    new MCPServer({ pipeline: makePipeline({}) });
    const callHandler = handlers.get(CallToolRequestSchema)!;
    const result = (await callHandler({
      params: { name: 'rag.list_providers' },
    })) as { content: unknown[] };
    expect(result.content).toBeDefined();
  });

  it('throws McpError for an unknown tool', async () => {
    new MCPServer({ pipeline: makePipeline({}) });
    const callHandler = handlers.get(CallToolRequestSchema)!;
    await expect(
      callHandler({ params: { name: 'rag.does_not_exist', arguments: {} } }),
    ).rejects.toThrow(/Unknown tool/);
  });

  it('returns an internal error response when a tool handler throws', async () => {
    // Replace a tool's handler with one that throws so the server's outer
    // catch path is exercised. The server shares the same tool array instance.
    const original = retrievalTools[0].handler;
    retrievalTools[0].handler = async () => {
      throw new Error('handler blew up');
    };
    try {
      new MCPServer({ pipeline: makePipeline({}) });
      const callHandler = handlers.get(CallToolRequestSchema)!;
      const result = (await callHandler({
        params: { name: retrievalTools[0].name, arguments: {} },
      })) as { content: Array<{ text: string }>; isError?: boolean };
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).error).toBe('Internal error');
    } finally {
      retrievalTools[0].handler = original;
    }
  });

  it('starts by connecting a transport', async () => {
    const server = new MCPServer({ pipeline: makePipeline({}) });
    await server.start();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('stops by closing the server and the pipeline', async () => {
    const pipelineClose = vi.fn().mockResolvedValue(undefined);
    const server = new MCPServer({ pipeline: makePipeline({ close: pipelineClose }) });
    await server.stop();
    expect(close).toHaveBeenCalledTimes(1);
    expect(pipelineClose).toHaveBeenCalledTimes(1);
  });
});

describe('createMCPServer', () => {
  it('creates and starts a server', async () => {
    const server = await createMCPServer(makePipeline({}));
    expect(server).toBeInstanceOf(MCPServer);
    expect(connect).toHaveBeenCalled();
  });
});

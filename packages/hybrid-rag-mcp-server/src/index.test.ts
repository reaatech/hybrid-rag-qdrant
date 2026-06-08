import { describe, expect, it, vi } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    setRequestHandler() {}
    connect() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  },
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));
vi.mock('@reaatech/hybrid-rag-observability', () => ({
  getLogger: () => ({ info: vi.fn() }),
}));

describe('package entry point', () => {
  it('re-exports the server factory and every tool group', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.createMCPServer).toBe('function');
    expect(typeof mod.MCPServer).toBe('function');

    const toolGroups = [
      'adminTools',
      'sandboxTools',
      'agentIntegrationTools',
      'costManagementTools',
      'evaluationTools',
      'ingestionTools',
      'migrationTools',
      'observabilityTools',
      'qualityTools',
      'queryAnalysisTools',
      'retrievalTools',
      'sessionManagementTools',
    ] as const;

    for (const group of toolGroups) {
      expect(Array.isArray((mod as Record<string, unknown>)[group])).toBe(true);
      expect(((mod as Record<string, unknown>)[group] as unknown[]).length).toBeGreaterThan(0);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providersInspectCommand } from './providers-inspect.js';

describe('providersInspectCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function output(): string {
    return logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
  }

  it('prints human-readable details for a known provider', () => {
    providersInspectCommand('chroma');
    const out = output();
    expect(out).toContain('Provider: chroma');
    expect(out).toContain('Availability:');
    expect(out).toContain('Adapter available: yes');
    expect(out).toContain('Local development: yes');
    expect(out).toContain('Local setup:');
    expect(out).toContain('Required config fields:');
    expect(out).toContain('Supported environment variables:');
    expect(out).toContain('HYBRID_RAG_CHROMA_URL');
    expect(out).toContain('legacy: CHROMA_URL');
    expect(out).toContain('Capability flags:');
    expect(out).toContain('Native hybrid search: false');
    expect(out).toContain('Cost model:');
    expect(out).toContain('Migration scan support: yes');
    expect(out).toContain('Known limitations:');
  });

  it('marks secret env vars without printing values', () => {
    providersInspectCommand('pgvector');
    const out = output();
    expect(out).toContain('HYBRID_RAG_PGVECTOR_CONNECTION_STRING');
    expect(out).toContain('secret');
    expect(out).toContain('required');
  });

  it('shows cloud-only providers and monthly base cost', () => {
    providersInspectCommand('pinecone');
    const out = output();
    expect(out).toContain('Local development: cloud only');
    expect(out).toContain('Monthly base cost: $70');
    expect(out).toContain('Native hybrid support: yes');
    expect(out).toContain('Migration scan support: no');
  });

  it('renders sandbox known limitations and zero-cost formatting', () => {
    providersInspectCommand('sandbox');
    const out = output();
    expect(out).toContain('Provider: sandbox');
    expect(out).toContain('no per-operation cost');
    expect(out).toContain('- Data is held in memory only and lost on process exit.');
  });

  it('outputs JSON with --json', () => {
    providersInspectCommand('qdrant', { json: true });
    const out = output();
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.provider).toBe('qdrant');
    expect(parsed.available).toBe(true);
    expect(parsed.nativeHybrid).toBe(false);
    expect(parsed.migrationScanSupport).toBe(true);
    expect(Array.isArray(parsed.envVars)).toBe(true);
    expect(parsed.capabilities).toBeTypeOf('object');
    expect(parsed.costModel).toBeTypeOf('object');
  });

  it('throws a helpful error for an unknown provider', () => {
    expect(() => providersInspectCommand('not-a-provider')).toThrow(
      /Unknown provider 'not-a-provider'/,
    );
    expect(() => providersInspectCommand('not-a-provider')).toThrow(/Available providers:/);
  });
});

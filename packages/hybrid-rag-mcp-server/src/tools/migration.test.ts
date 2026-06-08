import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import { migrationTools, ragMigrate } from './migration.js';

const { migrateVectors } = vi.hoisted(() => ({ migrateVectors: vi.fn() }));
vi.mock('@reaatech/hybrid-rag-migration', () => ({
  migrateVectors: (...args: unknown[]) => migrateVectors(...args),
}));

const localQdrant = {
  provider: 'qdrant',
  url: 'http://localhost:6333',
  collectionName: 'documents',
  vectorSize: 128,
};

const remoteQdrant = {
  provider: 'qdrant',
  url: 'http://remote.example.com:6333',
  collectionName: 'documents',
  vectorSize: 128,
};

beforeEach(() => {
  delete process.env.HYBRID_RAG_MIGRATION_ALLOWED_HOSTS;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.HYBRID_RAG_MIGRATION_ALLOWED_HOSTS;
});

describe('migrationTools registry', () => {
  it('exposes rag.migrate', () => {
    expect(migrationTools.map((t) => t.name)).toEqual(['rag.migrate']);
  });
});

describe('rag.migrate', () => {
  it('migrates between local endpoints and returns the summary', async () => {
    migrateVectors.mockResolvedValue({
      sourceProvider: 'qdrant',
      targetProvider: 'qdrant',
      pointsMigrated: 42,
      errors: [],
      durationMs: 100,
    });
    const res = await ragMigrate.handler(
      { sourceConfig: localQdrant, targetConfig: { ...localQdrant, collectionName: 'copy' } },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.pointsMigrated).toBe(42);
    expect(migrateVectors).toHaveBeenCalledWith(localQdrant, expect.any(Object), {
      batchSize: 100,
      collection: 'documents',
    });
  });

  it('passes through custom batchSize and collection', async () => {
    migrateVectors.mockResolvedValue({
      sourceProvider: 'qdrant',
      targetProvider: 'qdrant',
      pointsMigrated: 1,
      errors: [],
      durationMs: 1,
    });
    await ragMigrate.handler(
      {
        sourceConfig: localQdrant,
        targetConfig: localQdrant,
        batchSize: 50,
        collection: 'mycol',
      },
      makePipeline({}),
    );
    expect(migrateVectors.mock.calls[0][2]).toEqual({ batchSize: 50, collection: 'mycol' });
  });

  it('rejects an invalid source config and redacts secrets', async () => {
    const res = await ragMigrate.handler(
      {
        sourceConfig: { provider: 'qdrant', apiKey: 'super-secret' },
        targetConfig: localQdrant,
      },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    const payload = parseToolResult(res);
    expect(payload.error).toBe('Invalid source config');
    expect((payload.config as Record<string, unknown>).apiKey).toBe('***REDACTED***');
  });

  it('rejects an invalid target config and redacts secrets', async () => {
    const res = await ragMigrate.handler(
      {
        sourceConfig: localQdrant,
        targetConfig: { provider: 'supabase', serviceRoleKey: 'srk' },
      },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    const payload = parseToolResult(res);
    expect(payload.error).toBe('Invalid target config');
    expect((payload.config as Record<string, unknown>).serviceRoleKey).toBe('***REDACTED***');
  });

  it('blocks external targets without allowExternalTarget', async () => {
    const res = await ragMigrate.handler(
      { sourceConfig: localQdrant, targetConfig: remoteQdrant },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('is external');
    expect(migrateVectors).not.toHaveBeenCalled();
  });

  it('blocks external targets that are not in the allowlist even with allowExternalTarget', async () => {
    const res = await ragMigrate.handler(
      { sourceConfig: localQdrant, targetConfig: remoteQdrant, allowExternalTarget: true },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('not in the migration allowlist');
  });

  it('allows external hosts present in the explicit allowlist', async () => {
    migrateVectors.mockResolvedValue({
      sourceProvider: 'qdrant',
      targetProvider: 'qdrant',
      pointsMigrated: 3,
      errors: [],
      durationMs: 5,
    });
    const res = await ragMigrate.handler(
      {
        sourceConfig: localQdrant,
        targetConfig: remoteQdrant,
        allowExternalTarget: true,
        allowedHosts: ['remote.example.com'],
      },
      makePipeline({}),
    );
    expect(res.isError).toBeUndefined();
    expect(parseToolResult(res).pointsMigrated).toBe(3);
  });

  it('honors the HYBRID_RAG_MIGRATION_ALLOWED_HOSTS env allowlist', async () => {
    process.env.HYBRID_RAG_MIGRATION_ALLOWED_HOSTS = ' remote.example.com , other.com ';
    migrateVectors.mockResolvedValue({
      sourceProvider: 'qdrant',
      targetProvider: 'qdrant',
      pointsMigrated: 7,
      errors: [],
      durationMs: 5,
    });
    const res = await ragMigrate.handler(
      { sourceConfig: localQdrant, targetConfig: remoteQdrant, allowExternalTarget: true },
      makePipeline({}),
    );
    expect(parseToolResult(res).pointsMigrated).toBe(7);
  });

  it('surfaces a friendly message when the migration package is missing', async () => {
    const err = new Error('missing') as Error & { code?: string };
    err.code = 'ERR_MODULE_NOT_FOUND';
    migrateVectors.mockRejectedValue(err);
    const res = await ragMigrate.handler(
      { sourceConfig: localQdrant, targetConfig: localQdrant },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain('Migration package not installed');
  });

  it('extracts hosts from connection strings via the host= fallback', async () => {
    const pgRemote = {
      provider: 'pgvector',
      connectionString: 'host=remote.example.com port=5432 dbname=rag',
      tableName: 'embeddings',
      vectorDimension: 128,
    };
    const res = await ragMigrate.handler(
      { sourceConfig: localQdrant, targetConfig: pgRemote },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toContain("'remote.example.com'");
  });

  it('allows configs with no extractable host (sandbox)', async () => {
    migrateVectors.mockResolvedValue({
      sourceProvider: 'sandbox',
      targetProvider: 'sandbox',
      pointsMigrated: 0,
      errors: [],
      durationMs: 1,
    });
    const res = await ragMigrate.handler(
      {
        sourceConfig: { provider: 'sandbox' },
        targetConfig: { provider: 'sandbox' },
      },
      makePipeline({}),
    );
    expect(res.isError).toBeUndefined();
    expect(parseToolResult(res).pointsMigrated).toBe(0);
  });

  it('surfaces generic migration errors', async () => {
    migrateVectors.mockRejectedValue(new Error('mid-migration failure'));
    const res = await ragMigrate.handler(
      { sourceConfig: localQdrant, targetConfig: localQdrant },
      makePipeline({}),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('mid-migration failure');
  });
});

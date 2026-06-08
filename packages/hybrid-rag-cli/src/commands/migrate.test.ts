import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validateVectorStoreConfigMock = vi.fn();
const migrateVectorsMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag', () => ({
  validateVectorStoreConfig: (...args: unknown[]) => validateVectorStoreConfigMock(...args),
}));

vi.mock('@reaatech/hybrid-rag-migration', () => ({
  migrateVectors: (...args: unknown[]) => migrateVectorsMock(...args),
}));

import { writeFile } from 'node:fs/promises';
import { type MigrateOptions, migrateCommand } from './migrate.js';

const writeFileMock = vi.mocked(writeFile);

function baseOptions(overrides: Partial<MigrateOptions>): MigrateOptions {
  return {
    from: '',
    fromProvider: '',
    to: '',
    toProvider: '',
    batchSize: '100',
    dryRun: false,
    continueOnError: false,
    plan: '',
    ...overrides,
  };
}

const ORIGINAL_ENV = { ...process.env };

describe('migrateCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    validateVectorStoreConfigMock.mockReset();
    migrateVectorsMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined as never);
    // identity validator that echoes provider for assertions
    validateVectorStoreConfigMock.mockImplementation((c: Record<string, unknown>) => c);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when neither config JSON nor provider is given', async () => {
    await expect(migrateCommand(baseOptions({}))).rejects.toThrow(
      'Specify --from <JSON> or --from-provider <name>',
    );
  });

  it('parses inline JSON configs and writes a migration plan', async () => {
    await migrateCommand(
      baseOptions({
        from: JSON.stringify({ provider: 'qdrant' }),
        to: JSON.stringify({ provider: 'lancedb' }),
        batchSize: '250',
        plan: 'plan.json',
        dryRun: true,
        continueOnError: true,
      }),
    );

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [path, body] = writeFileMock.mock.calls[0];
    expect(path).toBe('plan.json');
    const parsed = JSON.parse(body as string);
    expect(parsed.source.provider).toBe('qdrant');
    expect(parsed.target.provider).toBe('lancedb');
    expect(parsed.batchSize).toBe(250);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.continueOnError).toBe(true);
    expect(migrateVectorsMock).not.toHaveBeenCalled();
  });

  it('prints dry-run summary without migrating', async () => {
    await migrateCommand(
      baseOptions({ fromProvider: 'sandbox', toProvider: 'sandbox', dryRun: true }),
    );

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Dry-run mode. No vectors migrated.');
    expect(out).toContain('Source: sandbox');
    expect(out).toContain('Target: sandbox');
    expect(migrateVectorsMock).not.toHaveBeenCalled();
  });

  it('performs migration and reports points migrated', async () => {
    migrateVectorsMock.mockResolvedValue({
      pointsMigrated: 7,
      durationMs: 123,
      errors: [],
    });

    await migrateCommand(
      baseOptions({
        fromProvider: 'sandbox',
        toProvider: 'sandbox',
        batchSize: undefined as never,
      }),
    );

    expect(migrateVectorsMock).toHaveBeenCalledWith(
      { provider: 'sandbox', collectionName: 'documents' },
      { provider: 'sandbox', collectionName: 'documents' },
      { batchSize: 100, continueOnError: false },
    );
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Migrated 7 points in 123ms');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reports errors from migration', async () => {
    migrateVectorsMock.mockResolvedValue({
      pointsMigrated: 1,
      durationMs: 10,
      errors: ['e1', 'e2'],
    });

    await migrateCommand(
      baseOptions({ fromProvider: 'sandbox', toProvider: 'sandbox', continueOnError: true }),
    );

    expect(errorSpy).toHaveBeenCalledWith('Errors: 2');
  });

  it('builds shorthand configs for every provider, reading env where required', async () => {
    process.env.QDRANT_URL = 'http://q:6333';
    process.env.QDRANT_API_KEY = 'qkey';
    process.env.LANCEDB_URI = './lance';
    process.env.CHROMA_URL = 'http://chroma';
    process.env.PINECONE_API_KEY = 'pk';
    process.env.WEAVIATE_URL = 'http://weav';
    process.env.PGVECTOR_CONNECTION_STRING = 'postgres://x';
    process.env.MILVUS_ADDRESS = 'localhost:19530';
    process.env.ELASTICSEARCH_NODE = 'http://es';
    process.env.OPENSEARCH_NODE = 'http://os';
    process.env.REDIS_URL = 'redis://r';
    process.env.MONGODB_CONNECTION_STRING = 'mongodb://m';
    process.env.MONGODB_DATABASE = 'db';
    process.env.AZURE_AI_SEARCH_ENDPOINT = 'http://az';
    process.env.AZURE_AI_SEARCH_API_KEY = 'azk';
    process.env.VESPA_ENDPOINT = 'http://vespa';
    process.env.SUPABASE_URL = 'http://sb';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk';

    const providers = [
      'qdrant',
      'lancedb',
      'sandbox',
      'chroma',
      'pinecone',
      'weaviate',
      'pgvector',
      'milvus',
      'elasticsearch',
      'opensearch',
      'redis',
      'mongodb',
      'azure-ai-search',
      'vespa',
      'supabase',
    ];

    for (const provider of providers) {
      validateVectorStoreConfigMock.mockClear();
      await migrateCommand(
        baseOptions({ fromProvider: provider, toProvider: 'sandbox', dryRun: true }),
      );
      // first validate call corresponds to the source provider
      const firstArg = validateVectorStoreConfigMock.mock.calls[0][0] as { provider: string };
      expect(firstArg.provider).toBe(provider);
    }
  });

  it('throws a descriptive error when a required env var is missing', async () => {
    process.env.PINECONE_API_KEY = '';
    await expect(
      migrateCommand(baseOptions({ fromProvider: 'pinecone', toProvider: 'sandbox' })),
    ).rejects.toThrow("Provider 'pinecone' requires PINECONE_API_KEY or a full JSON config");
  });

  it('respects custom collection/dimension env overrides', async () => {
    process.env.HYBRID_RAG_COLLECTION = 'custom';
    process.env.HYBRID_RAG_VECTOR_DIMENSION = '768';

    await migrateCommand(
      baseOptions({ fromProvider: 'lancedb', toProvider: 'sandbox', dryRun: true }),
    );

    const lanceCfg = validateVectorStoreConfigMock.mock.calls[0][0] as {
      tableName: string;
      vectorDimension: number;
    };
    expect(lanceCfg.tableName).toBe('custom');
    expect(lanceCfg.vectorDimension).toBe(768);
  });
});

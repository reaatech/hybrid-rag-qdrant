import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeMock = vi.fn();
const getStatsMock = vi.fn();
const pipelineCtor = vi.fn();

vi.mock('@reaatech/hybrid-rag-pipeline', () => ({
  RAGPipeline: class {
    initialize = initializeMock;
    getStats = getStatsMock;
    constructor(config: unknown) {
      pipelineCtor(config);
    }
  },
}));

const ORIGINAL_ENV = { ...process.env };

interface ExitError extends Error {
  code: number | string | null | undefined;
}

async function runHealthcheck(): Promise<ExitError> {
  vi.resetModules();
  return await new Promise<ExitError>((resolve, reject) => {
    let resolved = false;
    // process.exit does not actually terminate in tests; record the code and
    // resolve. The healthcheck function calls exit as the last statement in
    // each branch, so letting execution fall through is harmless.
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      if (!resolved) {
        resolved = true;
        const err = new Error('exit') as ExitError;
        err.code = code;
        resolve(err);
      }
      return undefined as never;
    }) as never);

    import('./healthcheck.js').catch(reject);
  });
}

describe('healthcheck', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    initializeMock.mockReset();
    getStatsMock.mockReset();
    pipelineCtor.mockReset();
    initializeMock.mockResolvedValue(undefined);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it('exits 0 and writes success when a collection is present (qdrant via QDRANT_URL)', async () => {
    process.env.QDRANT_URL = 'http://localhost:6333';
    delete process.env.VECTOR_STORE_PROVIDER;
    getStatsMock.mockResolvedValue({ collectionName: 'documents' });

    const err = await runHealthcheck();

    expect(err.code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith('Health check passed\n');
    const cfg = pipelineCtor.mock.calls[0][0] as { vectorStore: { provider: string } };
    expect(cfg.vectorStore.provider).toBe('qdrant');
  });

  it('exits 1 when collection is missing', async () => {
    process.env.VECTOR_STORE_PROVIDER = 'sandbox';
    getStatsMock.mockResolvedValue({ collectionName: '' });

    const err = await runHealthcheck();

    expect(err.code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith('Health check failed: no collection\n');
  });

  it('exits 1 and reports the error message on failure', async () => {
    process.env.VECTOR_STORE_PROVIDER = 'sandbox';
    initializeMock.mockRejectedValue(new Error('init boom'));

    const err = await runHealthcheck();

    expect(err.code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith('Health check failed: init boom\n');
  });

  it('builds a pinecone config from env', async () => {
    delete process.env.QDRANT_URL;
    process.env.VECTOR_STORE_PROVIDER = 'pinecone';
    process.env.VECTOR_STORE_API_KEY = 'pk';
    getStatsMock.mockResolvedValue({ collectionName: 'documents' });

    await runHealthcheck();

    const cfg = pipelineCtor.mock.calls[0][0] as {
      vectorStore: { provider: string; apiKey: string };
    };
    expect(cfg.vectorStore.provider).toBe('pinecone');
    expect(cfg.vectorStore.apiKey).toBe('pk');
  });

  it('builds weaviate / chroma / pgvector / lancedb configs from env', async () => {
    getStatsMock.mockResolvedValue({ collectionName: 'documents' });
    delete process.env.QDRANT_URL;

    for (const provider of ['weaviate', 'chroma', 'pgvector', 'lancedb']) {
      pipelineCtor.mockClear();
      process.env.VECTOR_STORE_PROVIDER = provider;
      process.env.VECTOR_STORE_URL = 'http://store';
      await runHealthcheck();
      const cfg = pipelineCtor.mock.calls[0][0] as { vectorStore: { provider: string } };
      expect(cfg.vectorStore.provider).toBe(provider);
    }
  });

  it('applies default fallbacks when optional env vars are unset', async () => {
    getStatsMock.mockResolvedValue({ collectionName: 'documents' });
    for (const key of [
      'QDRANT_URL',
      'VECTOR_STORE_URL',
      'VECTOR_STORE_API_KEY',
      'COLLECTION_NAME',
      'VECTOR_DIMENSION',
    ]) {
      delete process.env[key];
    }

    for (const provider of ['qdrant', 'pinecone', 'weaviate', 'lancedb']) {
      pipelineCtor.mockClear();
      process.env.VECTOR_STORE_PROVIDER = provider;
      await runHealthcheck();
      const cfg = pipelineCtor.mock.calls[0][0] as { vectorStore: { provider: string } };
      expect(cfg.vectorStore.provider).toBe(provider);
    }
  });

  it('returns undefined config for an unknown provider', async () => {
    delete process.env.QDRANT_URL;
    process.env.VECTOR_STORE_PROVIDER = 'totally-unknown';
    getStatsMock.mockResolvedValue({ collectionName: 'documents' });

    await runHealthcheck();

    const cfg = pipelineCtor.mock.calls[0][0] as { vectorStore: unknown };
    expect(cfg.vectorStore).toBeUndefined();
  });
});

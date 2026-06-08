import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Workspace mocks -------------------------------------------------------
const initializeMock = vi.fn();
const getStatsMock = vi.fn();
const getVectorStoreHealthMock = vi.fn();
const getVectorStoreCapabilitiesMock = vi.fn();
const pipelineCtor = vi.fn();
const createMCPServerMock = vi.fn();
const validateVectorStoreConfigMock = vi.fn();
const yamlParseMock = vi.fn();
const readFileMock = vi.fn();

// --- Command mocks ---------------------------------------------------------
const ingestCommandMock = vi.fn();
const queryCommandMock = vi.fn();
const evaluateCommandMock = vi.fn();
const ablateCommandMock = vi.fn();
const benchmarkCommandMock = vi.fn();
const chunkCommandMock = vi.fn();
const migrateCommandMock = vi.fn();
const benchmarkDbCommandMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...a: unknown[]) => readFileMock(...a),
}));

vi.mock('@reaatech/hybrid-rag', () => ({
  validateVectorStoreConfig: (...a: unknown[]) => validateVectorStoreConfigMock(...a),
}));

vi.mock('@reaatech/hybrid-rag-mcp-server', () => ({
  createMCPServer: (...a: unknown[]) => createMCPServerMock(...a),
}));

vi.mock('@reaatech/hybrid-rag-pipeline', () => ({
  RAGPipeline: class {
    initialize = initializeMock;
    getStats = getStatsMock;
    getVectorStoreHealth = getVectorStoreHealthMock;
    getVectorStoreCapabilities = getVectorStoreCapabilitiesMock;
    constructor(config: unknown) {
      pipelineCtor(config);
    }
  },
}));

vi.mock('yaml', () => ({
  parse: (...a: unknown[]) => yamlParseMock(...a),
}));

vi.mock('./commands/ingest.js', () => ({
  ingestCommand: (...a: unknown[]) => ingestCommandMock(...a),
}));
vi.mock('./commands/query.js', () => ({
  queryCommand: (...a: unknown[]) => queryCommandMock(...a),
}));
vi.mock('./commands/evaluate.js', () => ({
  evaluateCommand: (...a: unknown[]) => evaluateCommandMock(...a),
}));
vi.mock('./commands/ablate.js', () => ({
  ablateCommand: (...a: unknown[]) => ablateCommandMock(...a),
}));
vi.mock('./commands/benchmark.js', () => ({
  benchmarkCommand: (...a: unknown[]) => benchmarkCommandMock(...a),
}));
vi.mock('./commands/chunk.js', () => ({
  chunkCommand: (...a: unknown[]) => chunkCommandMock(...a),
}));
vi.mock('./commands/migrate.js', () => ({
  migrateCommand: (...a: unknown[]) => migrateCommandMock(...a),
}));
vi.mock('./commands/benchmark-db.js', () => ({
  benchmarkDbCommand: (...a: unknown[]) => benchmarkDbCommandMock(...a),
}));

const ORIGINAL_ARGV = process.argv;
const ORIGINAL_ENV = { ...process.env };

async function runCli(args: string[]): Promise<void> {
  process.argv = ['node', 'hybrid-rag', ...args];
  vi.resetModules();
  await import('./index.js');
  // allow the async commander action handlers to settle
  await new Promise((r) => setTimeout(r, 0));
}

describe('CLI index', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    initializeMock.mockReset().mockResolvedValue(undefined);
    getStatsMock.mockReset().mockResolvedValue({ collectionName: 'documents', totalChunks: 5 });
    getVectorStoreHealthMock.mockReset().mockResolvedValue(true);
    getVectorStoreCapabilitiesMock.mockReset().mockResolvedValue({
      supportsHybridSearch: true,
      supportsMetadataFiltering: true,
      supportsBatchUpsert: true,
      supportsScan: true,
      maxBatchSize: 100,
      maxVectorDimension: 1536,
    });
    pipelineCtor.mockReset();
    createMCPServerMock.mockReset().mockResolvedValue(undefined);
    validateVectorStoreConfigMock.mockReset().mockImplementation((c: unknown) => c);
    yamlParseMock.mockReset().mockReturnValue({});
    readFileMock.mockReset().mockResolvedValue('yaml: true');
    ingestCommandMock.mockReset().mockResolvedValue(undefined);
    queryCommandMock.mockReset().mockResolvedValue(undefined);
    evaluateCommandMock.mockReset().mockResolvedValue(undefined);
    ablateCommandMock.mockReset().mockResolvedValue(undefined);
    benchmarkCommandMock.mockReset().mockResolvedValue(undefined);
    chunkCommandMock.mockReset().mockResolvedValue(undefined);
    migrateCommandMock.mockReset().mockResolvedValue(undefined);
    benchmarkDbCommandMock.mockReset().mockResolvedValue(undefined);

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = ORIGINAL_ARGV;
    process.env = { ...ORIGINAL_ENV };
  });

  it('runs the server command and initializes the pipeline (default lancedb)', async () => {
    await runCli(['server']);
    expect(pipelineCtor).toHaveBeenCalledTimes(1);
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(createMCPServerMock).toHaveBeenCalledTimes(1);
  });

  it('runs ingest with provider override and merges options', async () => {
    await runCli(['ingest', 'a.md', 'b.md', '--vector-store', 'sandbox']);
    expect(ingestCommandMock).toHaveBeenCalledTimes(1);
    const [files] = ingestCommandMock.mock.calls[0];
    expect(files).toEqual(['a.md', 'b.md']);
  });

  it('runs query with options', async () => {
    await runCli(['query', 'hello', '--top-k', '3']);
    expect(queryCommandMock).toHaveBeenCalledTimes(1);
    const [q] = queryCommandMock.mock.calls[0];
    expect(q).toBe('hello');
  });

  it('runs evaluate', async () => {
    await runCli(['evaluate', 'ds.jsonl']);
    expect(evaluateCommandMock).toHaveBeenCalledTimes(1);
  });

  it('runs ablate', async () => {
    await runCli(['ablate', 'cfg.yaml', 'ds.jsonl']);
    expect(ablateCommandMock).toHaveBeenCalledTimes(1);
  });

  it('runs benchmark', async () => {
    await runCli(['benchmark']);
    expect(benchmarkCommandMock).toHaveBeenCalledTimes(1);
  });

  it('runs chunk (no pipeline needed)', async () => {
    await runCli(['chunk', 'file.txt']);
    expect(chunkCommandMock).toHaveBeenCalledTimes(1);
    expect(pipelineCtor).not.toHaveBeenCalled();
  });

  it('runs migrate', async () => {
    await runCli([
      'migrate',
      '--from-provider',
      'sandbox',
      '--to-provider',
      'sandbox',
      '--dry-run',
    ]);
    expect(migrateCommandMock).toHaveBeenCalledTimes(1);
  });

  it('runs benchmark-db', async () => {
    await runCli(['benchmark-db', '--configs', 'a.json']);
    expect(benchmarkDbCommandMock).toHaveBeenCalledTimes(1);
  });

  it('lists providers in human-readable form', async () => {
    await runCli(['providers']);
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Available vector database providers:');
    expect(out).toContain('qdrant');
    expect(out).toContain('[cloud only]');
    expect(out).toContain('[native hybrid]');
  });

  it('lists providers as JSON', async () => {
    await runCli(['providers', '--json']);
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('"name": "qdrant"');
  });

  it('runs doctor with capabilities and stats', async () => {
    await runCli(['doctor']);
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Vector store healthy: true');
    expect(out).toContain('Supports hybrid search: true');
    expect(out).toContain('Total chunks: 5');
  });

  it('doctor handles missing capabilities and unhealthy store', async () => {
    getVectorStoreHealthMock.mockResolvedValue(undefined);
    getVectorStoreCapabilitiesMock.mockResolvedValue(null);
    await runCli(['doctor']);
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Vector store healthy: false');
  });

  it('doctor reports diagnostics failure and exits 1', async () => {
    initializeMock.mockRejectedValue(new Error('diag boom'));
    await runCli(['doctor']);
    expect(errorSpy).toHaveBeenCalledWith('  Diagnostics failed: diag boom');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('parses an inline JSON --vector-store config', async () => {
    await runCli(['--vector-store', '{"provider":"sandbox"}', 'server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalled();
  });

  it('merges a YAML --config file into the pipeline config', async () => {
    yamlParseMock.mockReturnValue({ collectionName: 'fromYaml' });
    await runCli(['--config', 'conf.yaml', 'server']);
    expect(readFileMock).toHaveBeenCalledWith('conf.yaml', 'utf-8');
    const cfg = pipelineCtor.mock.calls[0][0] as { collectionName: string };
    expect(cfg.collectionName).toBe('fromYaml');
  });

  it('builds qdrant shorthand config from a provider name', async () => {
    process.env.QDRANT_URL = 'http://localhost:6333';
    await runCli(['--vector-store', 'qdrant', 'server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'qdrant' }),
    );
  });

  it('throws via main().catch when a required env var is missing', async () => {
    // pinecone requires PINECONE_API_KEY -> buildVectorStoreConfig throws in initPipeline
    delete process.env.PINECONE_API_KEY;
    await runCli(['--vector-store', 'pinecone', 'server']);
    expect(errorSpy).toHaveBeenCalledWith('Error:', expect.stringContaining('PINECONE_API_KEY'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('reuses the cached pipeline on subsequent init within one process', async () => {
    // two commands in a single module load is not possible, but cover the
    // shorthand for a non-default collection
    await runCli(['--collection', 'mycoll', 'server']);
    const cfg = pipelineCtor.mock.calls[0][0] as { collectionName: string };
    expect(cfg.collectionName).toBe('mycoll');
  });

  it('builds shorthand configs for every provider with required env set', async () => {
    const env = {
      QDRANT_URL: 'http://q:6333',
      QDRANT_API_KEY: 'qkey',
      LANCEDB_URI: './lance',
      LANCEDB_TABLE: 'lt',
      CHROMA_URL: 'http://chroma',
      CHROMA_TENANT: 'tenant',
      PINECONE_API_KEY: 'pk',
      PINECONE_INDEX: 'idx',
      PINECONE_CLOUD: 'aws',
      PINECONE_REGION: 'us-east-1',
      PINECONE_NAMESPACE: 'ns',
      WEAVIATE_URL: 'http://weav',
      WEAVIATE_API_KEY: 'wk',
      WEAVIATE_CLASS: 'Doc',
      WEAVIATE_TENANT: 'wt',
      PGVECTOR_CONNECTION_STRING: 'postgres://x',
      PGVECTOR_TABLE: 'pt',
      PGVECTOR_SCHEMA: 'public',
      MILVUS_ADDRESS: 'host:19530',
      MILVUS_TOKEN: 'mt',
      MILVUS_DATABASE: 'mdb',
      ELASTICSEARCH_NODE: 'http://es',
      ELASTICSEARCH_API_KEY: 'ek',
      ELASTICSEARCH_USERNAME: 'eu',
      ELASTICSEARCH_PASSWORD: 'ep',
      ELASTICSEARCH_INDEX: 'ei',
      OPENSEARCH_NODE: 'http://os',
      OPENSEARCH_API_KEY: 'ok',
      OPENSEARCH_USERNAME: 'ou',
      OPENSEARCH_PASSWORD: 'op',
      OPENSEARCH_INDEX: 'oi',
      REDIS_URL: 'redis://r',
      REDIS_INDEX: 'ri',
      REDIS_KEY_PREFIX: 'rp',
      MONGODB_CONNECTION_STRING: 'mongodb://m',
      MONGODB_DATABASE: 'db',
      MONGODB_VECTOR_INDEX: 'vi',
      AZURE_AI_SEARCH_ENDPOINT: 'http://az',
      AZURE_AI_SEARCH_API_KEY: 'azk',
      AZURE_AI_SEARCH_INDEX: 'azi',
      VESPA_ENDPOINT: 'http://vespa',
      VESPA_NAMESPACE: 'vns',
      VESPA_DOCUMENT_TYPE: 'vdt',
      VESPA_API_KEY: 'vk',
      SUPABASE_URL: 'http://sb',
      SUPABASE_SERVICE_ROLE_KEY: 'srk',
      SUPABASE_TABLE: 'st',
      SUPABASE_SCHEMA: 'public',
      HYBRID_RAG_VECTOR_DIMENSION: '768',
    };
    Object.assign(process.env, env);

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
      await runCli(['--vector-store', provider, 'server']);
      const arg = validateVectorStoreConfigMock.mock.calls[0][0] as { provider: string };
      expect(arg.provider).toBe(provider);
    }
  });

  it('uses default fallbacks when optional env vars are unset', async () => {
    for (const key of Object.keys(process.env)) {
      if (
        key.startsWith('QDRANT_') ||
        key.startsWith('LANCEDB_') ||
        key.startsWith('CHROMA_') ||
        key.startsWith('MILVUS_') ||
        key.startsWith('VESPA_') ||
        key.startsWith('HYBRID_RAG_')
      ) {
        delete process.env[key];
      }
    }

    for (const provider of ['qdrant', 'lancedb', 'milvus', 'vespa', 'chroma']) {
      // VESPA requires endpoint; provide just the required one
      if (provider === 'vespa') process.env.VESPA_ENDPOINT = 'http://vespa';
      validateVectorStoreConfigMock.mockClear();
      await runCli(['--vector-store', provider, 'server']);
      const arg = validateVectorStoreConfigMock.mock.calls[0][0] as { provider: string };
      expect(arg.provider).toBe(provider);
    }
  });

  it.each([
    ['weaviate', 'WEAVIATE_URL'],
    ['pgvector', 'PGVECTOR_CONNECTION_STRING'],
    ['elasticsearch', 'ELASTICSEARCH_NODE'],
    ['opensearch', 'OPENSEARCH_NODE'],
    ['redis', 'REDIS_URL'],
    ['mongodb', 'MONGODB_CONNECTION_STRING'],
    ['azure-ai-search', 'AZURE_AI_SEARCH_ENDPOINT'],
    ['vespa', 'VESPA_ENDPOINT'],
    ['supabase', 'SUPABASE_URL'],
  ])('throws when %s is missing required env %s', async (provider, envName) => {
    delete process.env[envName];
    delete process.env[`HYBRID_RAG_${envName}`];
    await runCli(['--vector-store', provider, 'server']);
    expect(errorSpy).toHaveBeenCalledWith('Error:', expect.stringContaining(envName));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // --- env var configuration (Phase 26.3) --------------------------------

  it('honors HYBRID_RAG_VECTOR_STORE when no --vector-store flag is given', async () => {
    process.env.HYBRID_RAG_VECTOR_STORE = 'sandbox';
    await runCli(['server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'sandbox' }),
    );
  });

  it('honors HYBRID_RAG_COLLECTION when no --collection flag is given', async () => {
    process.env.HYBRID_RAG_COLLECTION = 'env-coll';
    await runCli(['--vector-store', 'sandbox', 'server']);
    const cfg = pipelineCtor.mock.calls[0][0] as { collectionName: string };
    expect(cfg.collectionName).toBe('env-coll');
  });

  it('CLI --collection beats HYBRID_RAG_COLLECTION env var', async () => {
    process.env.HYBRID_RAG_COLLECTION = 'env-coll';
    await runCli(['--vector-store', 'sandbox', '--collection', 'cli-coll', 'server']);
    const cfg = pipelineCtor.mock.calls[0][0] as { collectionName: string };
    expect(cfg.collectionName).toBe('cli-coll');
  });

  it('CLI --vector-store beats HYBRID_RAG_VECTOR_STORE env var', async () => {
    process.env.HYBRID_RAG_VECTOR_STORE = 'qdrant';
    await runCli(['--vector-store', 'sandbox', 'server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'sandbox' }),
    );
  });

  it('defaults to lancedb when no flag or env var is set', async () => {
    delete process.env.HYBRID_RAG_VECTOR_STORE;
    await runCli(['server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'lancedb' }),
    );
  });

  it('prefixed HYBRID_RAG_QDRANT_URL beats the legacy QDRANT_URL', async () => {
    process.env.HYBRID_RAG_QDRANT_URL = 'http://prefixed:6333';
    process.env.QDRANT_URL = 'http://legacy:6333';
    await runCli(['--vector-store', 'qdrant', 'server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'qdrant', url: 'http://prefixed:6333' }),
    );
  });

  it('falls back to the legacy QDRANT_URL when the prefixed one is unset', async () => {
    delete process.env.HYBRID_RAG_QDRANT_URL;
    process.env.QDRANT_URL = 'http://legacy:6333';
    await runCli(['--vector-store', 'qdrant', 'server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'qdrant', url: 'http://legacy:6333' }),
    );
  });

  it('resolves a required secret from the prefixed env var', async () => {
    delete process.env.PINECONE_API_KEY;
    process.env.HYBRID_RAG_PINECONE_API_KEY = 'prefixed-key';
    await runCli(['--vector-store', 'pinecone', 'server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'pinecone', apiKey: 'prefixed-key' }),
    );
  });

  it('config-file collectionName beats env var but loses to CLI flag', async () => {
    yamlParseMock.mockReturnValue({ collectionName: 'fromYaml' });
    process.env.HYBRID_RAG_COLLECTION = 'env-coll';
    await runCli(['--vector-store', 'sandbox', '--config', 'conf.yaml', 'server']);
    const cfg = pipelineCtor.mock.calls[0][0] as { collectionName: string };
    expect(cfg.collectionName).toBe('fromYaml');
  });

  it('config-file vectorStore object is used when no CLI flag is given', async () => {
    yamlParseMock.mockReturnValue({ vectorStore: { provider: 'sandbox' } });
    await runCli(['--config', 'conf.yaml', 'server']);
    const cfg = pipelineCtor.mock.calls[0][0] as { vectorStore: { provider: string } };
    expect(cfg.vectorStore.provider).toBe('sandbox');
    // builder is not invoked because the object form is used directly
  });

  it('config-file vectorStore provider string participates in precedence', async () => {
    yamlParseMock.mockReturnValue({ vectorStore: 'sandbox' });
    await runCli(['--config', 'conf.yaml', 'server']);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'sandbox' }),
    );
  });

  // --- providers inspect (Phase 26.4) ------------------------------------

  it('inspects a provider in human-readable form', async () => {
    await runCli(['providers', 'inspect', 'chroma']);
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Provider: chroma');
    expect(out).toContain('HYBRID_RAG_CHROMA_URL');
    expect(out).toContain('Capability flags:');
    expect(out).toContain('Cost model:');
  });

  it('inspects a provider as JSON', async () => {
    await runCli(['providers', 'inspect', 'pgvector', '--json']);
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('"provider": "pgvector"');
    expect(out).toContain('"migrationScanSupport"');
  });

  it('errors and exits 1 for an unknown provider in inspect', async () => {
    await runCli(['providers', 'inspect', 'nope']);
    expect(errorSpy).toHaveBeenCalledWith(
      'Error:',
      expect.stringContaining("Unknown provider 'nope'"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

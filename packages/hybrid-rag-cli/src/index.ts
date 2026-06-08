#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import type { VectorStoreConfig, VectorStoreProvider } from '@reaatech/hybrid-rag';
import { validateVectorStoreConfig } from '@reaatech/hybrid-rag';
import { createMCPServer } from '@reaatech/hybrid-rag-mcp-server';
import { RAGPipeline, type RAGPipelineConfig } from '@reaatech/hybrid-rag-pipeline';
import { Command } from 'commander';
import { parse as load } from 'yaml';
import { type AblateOptions, ablateCommand } from './commands/ablate.js';
import { type BenchmarkOptions, benchmarkCommand } from './commands/benchmark.js';
import { type BenchmarkDbOptions, benchmarkDbCommand } from './commands/benchmark-db.js';
import { type ChunkOptions, chunkCommand } from './commands/chunk.js';
import { type EvaluateOptions, evaluateCommand } from './commands/evaluate.js';
import { type IngestOptions, ingestCommand } from './commands/ingest.js';
import { type MigrateOptions, migrateCommand } from './commands/migrate.js';
import {
  type ProvidersInspectOptions,
  providersInspectCommand,
} from './commands/providers-inspect.js';
import { type QueryCommandOptions, queryCommand } from './commands/query.js';
import { readEnv } from './env-config.js';

interface GlobalOptions {
  vectorStore?: string;
  collection?: string;
  config?: string;
}

let pipeline: RAGPipeline | null = null;

function readPackageVersion(): string {
  return '0.1.1';
}

/**
 * Resolve a required env var, preferring the HYBRID_RAG_* prefixed name and
 * falling back to the legacy unprefixed name for backward compatibility.
 */
function requireEnv(prefixedName: string, provider: string, legacyName?: string): string {
  const value = readEnv(prefixedName, legacyName);
  if (!value) {
    const hint = legacyName ? `${prefixedName} (or ${legacyName})` : prefixedName;
    throw new Error(`Provider '${provider}' requires ${hint} or a full --vector-store JSON config`);
  }
  return value;
}

function buildVectorStoreConfig(
  provider: VectorStoreProvider,
  collection: string,
): VectorStoreConfig {
  const vectorDimension = Number.parseInt(readEnv('HYBRID_RAG_VECTOR_DIMENSION') ?? '1536', 10);
  const collectionName = collection || 'documents';

  switch (provider) {
    case 'qdrant':
      return validateVectorStoreConfig({
        provider,
        url: readEnv('HYBRID_RAG_QDRANT_URL', 'QDRANT_URL') ?? 'http://localhost:6333',
        apiKey: readEnv('HYBRID_RAG_QDRANT_API_KEY', 'QDRANT_API_KEY'),
        collectionName,
        vectorSize: vectorDimension,
      });
    case 'lancedb':
      return validateVectorStoreConfig({
        provider,
        uri: readEnv('HYBRID_RAG_LANCEDB_URI', 'LANCEDB_URI') ?? './.lancedb',
        tableName: readEnv('HYBRID_RAG_LANCEDB_TABLE', 'LANCEDB_TABLE') ?? collectionName,
        vectorDimension,
      });
    case 'sandbox':
      return validateVectorStoreConfig({ provider, collectionName });
    case 'chroma':
      return validateVectorStoreConfig({
        provider,
        url: readEnv('HYBRID_RAG_CHROMA_URL', 'CHROMA_URL'),
        collectionName,
        tenant: readEnv('HYBRID_RAG_CHROMA_TENANT', 'CHROMA_TENANT'),
      });
    case 'pinecone':
      return validateVectorStoreConfig({
        provider,
        apiKey: requireEnv('HYBRID_RAG_PINECONE_API_KEY', provider, 'PINECONE_API_KEY'),
        indexName: readEnv('HYBRID_RAG_PINECONE_INDEX', 'PINECONE_INDEX') ?? collectionName,
        cloud: readEnv('HYBRID_RAG_PINECONE_CLOUD', 'PINECONE_CLOUD'),
        region: readEnv('HYBRID_RAG_PINECONE_REGION', 'PINECONE_REGION'),
        namespace: readEnv('HYBRID_RAG_PINECONE_NAMESPACE', 'PINECONE_NAMESPACE'),
      });
    case 'weaviate':
      return validateVectorStoreConfig({
        provider,
        url: requireEnv('HYBRID_RAG_WEAVIATE_URL', provider, 'WEAVIATE_URL'),
        apiKey: readEnv('HYBRID_RAG_WEAVIATE_API_KEY', 'WEAVIATE_API_KEY'),
        className: readEnv('HYBRID_RAG_WEAVIATE_CLASS', 'WEAVIATE_CLASS') ?? collectionName,
        tenant: readEnv('HYBRID_RAG_WEAVIATE_TENANT', 'WEAVIATE_TENANT'),
      });
    case 'pgvector':
      return validateVectorStoreConfig({
        provider,
        connectionString: requireEnv(
          'HYBRID_RAG_PGVECTOR_CONNECTION_STRING',
          provider,
          'PGVECTOR_CONNECTION_STRING',
        ),
        tableName: readEnv('HYBRID_RAG_PGVECTOR_TABLE', 'PGVECTOR_TABLE') ?? collectionName,
        vectorDimension,
        schema: readEnv('HYBRID_RAG_PGVECTOR_SCHEMA', 'PGVECTOR_SCHEMA'),
      });
    case 'milvus':
      return validateVectorStoreConfig({
        provider,
        address: readEnv('HYBRID_RAG_MILVUS_ADDRESS', 'MILVUS_ADDRESS') ?? 'localhost:19530',
        token: readEnv('HYBRID_RAG_MILVUS_TOKEN', 'MILVUS_TOKEN'),
        collectionName,
        vectorDimension,
        database: readEnv('HYBRID_RAG_MILVUS_DATABASE', 'MILVUS_DATABASE'),
      });
    case 'elasticsearch':
      return validateVectorStoreConfig({
        provider,
        node: requireEnv('HYBRID_RAG_ELASTICSEARCH_NODE', provider, 'ELASTICSEARCH_NODE'),
        apiKey: readEnv('HYBRID_RAG_ELASTICSEARCH_API_KEY', 'ELASTICSEARCH_API_KEY'),
        username: readEnv('HYBRID_RAG_ELASTICSEARCH_USERNAME', 'ELASTICSEARCH_USERNAME'),
        password: readEnv('HYBRID_RAG_ELASTICSEARCH_PASSWORD', 'ELASTICSEARCH_PASSWORD'),
        indexName:
          readEnv('HYBRID_RAG_ELASTICSEARCH_INDEX', 'ELASTICSEARCH_INDEX') ?? collectionName,
        vectorDimension,
      });
    case 'opensearch':
      return validateVectorStoreConfig({
        provider,
        node: requireEnv('HYBRID_RAG_OPENSEARCH_NODE', provider, 'OPENSEARCH_NODE'),
        apiKey: readEnv('HYBRID_RAG_OPENSEARCH_API_KEY', 'OPENSEARCH_API_KEY'),
        username: readEnv('HYBRID_RAG_OPENSEARCH_USERNAME', 'OPENSEARCH_USERNAME'),
        password: readEnv('HYBRID_RAG_OPENSEARCH_PASSWORD', 'OPENSEARCH_PASSWORD'),
        indexName: readEnv('HYBRID_RAG_OPENSEARCH_INDEX', 'OPENSEARCH_INDEX') ?? collectionName,
        vectorDimension,
      });
    case 'redis':
      return validateVectorStoreConfig({
        provider,
        url: requireEnv('HYBRID_RAG_REDIS_URL', provider, 'REDIS_URL'),
        indexName: readEnv('HYBRID_RAG_REDIS_INDEX', 'REDIS_INDEX') ?? collectionName,
        vectorDimension,
        keyPrefix: readEnv('HYBRID_RAG_REDIS_KEY_PREFIX', 'REDIS_KEY_PREFIX'),
      });
    case 'mongodb':
      return validateVectorStoreConfig({
        provider,
        connectionString: requireEnv(
          'HYBRID_RAG_MONGODB_CONNECTION_STRING',
          provider,
          'MONGODB_CONNECTION_STRING',
        ),
        databaseName: requireEnv('HYBRID_RAG_MONGODB_DATABASE', provider, 'MONGODB_DATABASE'),
        collectionName,
        vectorIndexName:
          readEnv('HYBRID_RAG_MONGODB_VECTOR_INDEX', 'MONGODB_VECTOR_INDEX') ?? 'vector_index',
        vectorDimension,
      });
    case 'azure-ai-search':
      return validateVectorStoreConfig({
        provider,
        endpoint: requireEnv(
          'HYBRID_RAG_AZURE_AI_SEARCH_ENDPOINT',
          provider,
          'AZURE_AI_SEARCH_ENDPOINT',
        ),
        apiKey: requireEnv(
          'HYBRID_RAG_AZURE_AI_SEARCH_API_KEY',
          provider,
          'AZURE_AI_SEARCH_API_KEY',
        ),
        indexName:
          readEnv('HYBRID_RAG_AZURE_AI_SEARCH_INDEX', 'AZURE_AI_SEARCH_INDEX') ?? collectionName,
        vectorDimension,
      });
    case 'vespa':
      return validateVectorStoreConfig({
        provider,
        endpoint: requireEnv('HYBRID_RAG_VESPA_ENDPOINT', provider, 'VESPA_ENDPOINT'),
        namespace: readEnv('HYBRID_RAG_VESPA_NAMESPACE', 'VESPA_NAMESPACE') ?? 'default',
        documentType:
          readEnv('HYBRID_RAG_VESPA_DOCUMENT_TYPE', 'VESPA_DOCUMENT_TYPE') ?? collectionName,
        vectorDimension,
        apiKey: readEnv('HYBRID_RAG_VESPA_API_KEY', 'VESPA_API_KEY'),
      });
    case 'supabase':
      return validateVectorStoreConfig({
        provider,
        url: requireEnv('HYBRID_RAG_SUPABASE_URL', provider, 'SUPABASE_URL'),
        serviceRoleKey: requireEnv(
          'HYBRID_RAG_SUPABASE_SERVICE_ROLE_KEY',
          provider,
          'SUPABASE_SERVICE_ROLE_KEY',
        ),
        tableName: readEnv('HYBRID_RAG_SUPABASE_TABLE', 'SUPABASE_TABLE') ?? collectionName,
        vectorDimension,
        schema: readEnv('HYBRID_RAG_SUPABASE_SCHEMA', 'SUPABASE_SCHEMA'),
      });
  }
}

function parseVectorStoreOption(raw: string, collection: string): VectorStoreConfig {
  if (raw.trim().startsWith('{')) {
    return validateVectorStoreConfig(JSON.parse(raw));
  }
  return buildVectorStoreConfig(raw as VectorStoreProvider, collection);
}

async function initPipeline(options: GlobalOptions): Promise<RAGPipeline> {
  if (pipeline) {
    return pipeline;
  }

  // Read the config file first so its values can participate in precedence
  // resolution: explicit CLI arg > config file > env var > built-in default.
  let fileConfig: Record<string, unknown> = {};
  if (options.config) {
    const configContent = await readFile(options.config, 'utf-8');
    fileConfig = (load(configContent) as Record<string, unknown>) ?? {};
  }

  // Collection name precedence: explicit CLI arg > config file > env > default.
  const collectionName =
    options.collection ??
    (typeof fileConfig.collectionName === 'string'
      ? (fileConfig.collectionName as string)
      : undefined) ??
    readEnv('HYBRID_RAG_COLLECTION') ??
    'documents';

  // Vector-store selection precedence. A full `vectorStore` object in the config
  // file is used as-is (it already validated upstream) unless the CLI provided
  // an explicit override, which always wins.
  const fileVectorStore = fileConfig.vectorStore;
  let vectorStore: VectorStoreConfig;
  if (options.vectorStore !== undefined) {
    // (1) explicit CLI argument
    vectorStore = parseVectorStoreOption(options.vectorStore, collectionName);
  } else if (fileVectorStore !== undefined && typeof fileVectorStore === 'object') {
    // (2) config file (full object form)
    vectorStore = fileVectorStore as VectorStoreConfig;
  } else {
    // (2) config file (provider string form), (3) env var, then (4) default
    const provider =
      (typeof fileVectorStore === 'string' ? fileVectorStore : undefined) ??
      readEnv('HYBRID_RAG_VECTOR_STORE') ??
      'lancedb';
    vectorStore = parseVectorStoreOption(provider, collectionName);
  }

  let config: RAGPipelineConfig = {
    vectorStore,
    collectionName,
  };

  if (options.config) {
    config = {
      ...config,
      ...fileConfig,
      // Resolved values win so CLI/env precedence is preserved over raw
      // provider strings or stale collection names in the config file.
      vectorStore,
      collectionName,
    } as RAGPipelineConfig;
  }

  pipeline = new RAGPipeline(config);
  await pipeline.initialize();
  return pipeline;
}

async function main() {
  const program = new Command();
  program.enablePositionalOptions();

  const version = await readPackageVersion();

  program
    .name('hybrid-rag')
    .description('Hybrid RAG CLI with multi-vector-database support')
    .version(version)
    .option(
      '--vector-store <json|provider>',
      'Vector store config (JSON) or provider name (default: HYBRID_RAG_VECTOR_STORE or lancedb)',
    )
    .option('--collection <name>', 'Collection name (default: HYBRID_RAG_COLLECTION or documents)')
    .option('--config <path>', 'Configuration file path');

  program
    .command('server')
    .description('Start the MCP server over stdio')
    .action(async (_options, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      const p = await initPipeline(globalOpts);
      await createMCPServer(p);
    });

  program
    .command('ingest')
    .description('Ingest documents into the RAG system')
    .argument('<files...>', 'Files to ingest')
    .option('--chunk-size <size>', 'Chunk size', '512')
    .option('--overlap <size>', 'Chunk overlap', '50')
    .option('--strategy <strategy>', 'Chunking strategy', 'recursive')
    .option('--vector-store <json|provider>', 'Vector store config JSON or provider override')
    .action(async (files: string[], options: IngestOptions, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      const mergedOpts = {
        ...globalOpts,
        vectorStore: options.vectorStore ?? globalOpts.vectorStore,
      };
      const p = await initPipeline(mergedOpts);
      await ingestCommand(files, { ...options, ...mergedOpts }, p);
    });

  program
    .command('query')
    .description('Query the RAG system')
    .argument('<query>', 'Search query')
    .option('--top-k <k>', 'Number of results', '10')
    .option('--rerank', 'Use reranker', true)
    .option('--vector-weight <weight>', 'Vector weight for hybrid search', '0.5')
    .option('--bm25-weight <weight>', 'BM25 weight for hybrid search', '0.5')
    .option('--vector-store <json|provider>', 'Vector store config JSON or provider override')
    .action(async (query: string, options: QueryCommandOptions, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      const mergedOpts = {
        ...globalOpts,
        vectorStore: options.vectorStore ?? globalOpts.vectorStore,
      };
      const p = await initPipeline(mergedOpts);
      await queryCommand(query, { ...options, ...mergedOpts }, p);
    });

  program
    .command('evaluate')
    .description('Evaluate RAG performance on a dataset')
    .argument('<dataset>', 'Path to evaluation dataset (JSONL)')
    .option('--output <path>', 'Output file path', 'evaluation-results.json')
    .option('--metrics <metrics>', 'Comma-separated metrics', 'precision,recall,ndcg,map,mrr')
    .action(async (dataset: string, options: EvaluateOptions, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      const p = await initPipeline(globalOpts);
      await evaluateCommand(dataset, options, p);
    });

  program
    .command('ablate')
    .description('Run ablation study')
    .argument('<config>', 'Path to ablation config (YAML)')
    .argument('<dataset>', 'Path to evaluation dataset')
    .option('--output <path>', 'Output file path', 'ablation-results.json')
    .action(async (config: string, dataset: string, options: AblateOptions, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      const p = await initPipeline(globalOpts);
      await ablateCommand(config, dataset, options, p);
    });

  program
    .command('benchmark')
    .description('Run performance benchmark')
    .option('--output <path>', 'Output file path', 'benchmark-results.json')
    .option('--queries <count>', 'Number of test queries', '100')
    .option('--iterations <count>', 'Iterations per query', '3')
    .action(async (options: BenchmarkOptions, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      const p = await initPipeline(globalOpts);
      await benchmarkCommand('', options, p);
    });

  program
    .command('chunk')
    .description('Preview chunking of a document')
    .argument('<file>', 'File to chunk')
    .option('--strategy <strategy>', 'Chunking strategy', 'recursive')
    .option('--chunk-size <size>', 'Chunk size', '512')
    .option('--overlap <size>', 'Chunk overlap', '50')
    .option('--output <path>', 'Output file path', 'chunks.json')
    .action(async (file: string, options: ChunkOptions) => {
      await chunkCommand(file, options);
    });

  program
    .command('migrate')
    .description('Migrate vectors between vector databases')
    .option('--from <json>', 'Source vector store config (JSON)')
    .option('--from-provider <name>', 'Source provider name shorthand')
    .option('--to <json>', 'Target vector store config (JSON)')
    .option('--to-provider <name>', 'Target provider name shorthand')
    .option('--batch-size <n>', 'Batch size', '100')
    .option('--dry-run', 'Preview migration without executing', false)
    .option('--continue-on-error', 'Continue migration on point errors', false)
    .option('--plan <path>', 'Generate migration plan JSON')
    .action(async (options: MigrateOptions) => {
      await migrateCommand(options);
    });

  program
    .command('benchmark-db')
    .description('Benchmark multiple vector database configurations')
    .option('--configs <paths>', 'Comma-separated JSON config file paths')
    .option('--queries <path>', 'Path to queries JSON file')
    .option('--iterations <n>', 'Iterations per query', '10')
    .option('--output <path>', 'Output file path', 'benchmark-db-results.json')
    .action(async (options: BenchmarkDbOptions) => {
      await benchmarkDbCommand(options);
    });

  const providersCommand = program
    .command('providers')
    .description('List available vector database providers')
    .enablePositionalOptions()
    .option('--json', 'Output as JSON', false)
    .action(async (options: { json: boolean }) => {
      const providers = [
        {
          name: 'qdrant',
          description: 'Qdrant vector database',
          nativeHybrid: false,
          localDev: true,
        },
        {
          name: 'pinecone',
          description: 'Pinecone managed vector database',
          nativeHybrid: true,
          localDev: false,
        },
        {
          name: 'weaviate',
          description: 'Weaviate vector database',
          nativeHybrid: true,
          localDev: true,
        },
        {
          name: 'chroma',
          description: 'Chroma vector database (server required)',
          nativeHybrid: false,
          localDev: true,
        },
        {
          name: 'pgvector',
          description: 'PostgreSQL pgvector extension',
          nativeHybrid: false,
          localDev: true,
        },
        {
          name: 'milvus',
          description: 'Milvus/Zilliz vector database',
          nativeHybrid: false,
          localDev: true,
        },
        {
          name: 'elasticsearch',
          description: 'Elasticsearch with vector search',
          nativeHybrid: true,
          localDev: true,
        },
        {
          name: 'opensearch',
          description: 'OpenSearch with k-NN',
          nativeHybrid: true,
          localDev: true,
        },
        { name: 'redis', description: 'Redis Vector Search', nativeHybrid: true, localDev: true },
        {
          name: 'mongodb',
          description: 'MongoDB Atlas Vector Search',
          nativeHybrid: false,
          localDev: false,
        },
        {
          name: 'azure-ai-search',
          description: 'Azure AI Search',
          nativeHybrid: true,
          localDev: false,
        },
        {
          name: 'lancedb',
          description: 'LanceDB (embedded, zero-config default)',
          nativeHybrid: false,
          localDev: true,
        },
        { name: 'vespa', description: 'Vespa.ai', nativeHybrid: true, localDev: true },
        {
          name: 'supabase',
          description: 'Supabase Vector (pgvector-backed)',
          nativeHybrid: false,
          localDev: false,
        },
        {
          name: 'sandbox',
          description: 'In-memory sandbox for testing',
          nativeHybrid: false,
          localDev: true,
        },
      ];

      if (options.json) {
        console.log(JSON.stringify(providers, null, 2));
        return;
      }

      console.log('Available vector database providers:\n');
      for (const p of providers) {
        const hybrid = p.nativeHybrid ? ' [native hybrid]' : '';
        const local = p.localDev ? '' : ' [cloud only]';
        console.log(`  ${p.name}${local}${hybrid}`);
        console.log(`    ${p.description}`);
        console.log('');
      }
    });

  providersCommand
    .command('inspect <provider>')
    .description('Inspect a provider: capabilities, env vars, cost model, and limitations')
    .option('--json', 'Output as JSON', false)
    .action(async (provider: string, options: ProvidersInspectOptions) => {
      providersInspectCommand(provider, options);
    });

  program
    .command('doctor')
    .description('Run readiness diagnostics')
    .option('--verbose', 'Verbose output', false)
    .action(async (_options: { verbose: boolean }, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      console.log('Running readiness diagnostics...\n');

      try {
        const p = await initPipeline(globalOpts);
        const healthy = (await p.getVectorStoreHealth()) ?? false;

        console.log(`  Pipeline initialized: ${p !== null}`);
        console.log(`  Vector store healthy: ${healthy}`);

        const capabilities = (await p.getVectorStoreCapabilities?.()) ?? null;
        if (capabilities) {
          console.log(`  Supports hybrid search: ${capabilities.supportsHybridSearch}`);
          console.log(`  Supports metadata filtering: ${capabilities.supportsMetadataFiltering}`);
          console.log(`  Supports batch upsert: ${capabilities.supportsBatchUpsert}`);
          console.log(`  Supports scan: ${capabilities.supportsScan}`);
          console.log(`  Max batch size: ${capabilities.maxBatchSize}`);
          console.log(`  Max vector dimension: ${capabilities.maxVectorDimension}`);
        }

        const stats = await p.getStats();
        console.log(`\n  Collection: ${stats.collectionName}`);
        console.log(`  Total chunks: ${stats.totalChunks}`);
      } catch (error) {
        console.error(`  Diagnostics failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

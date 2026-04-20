#!/usr/bin/env node

/**
 * CLI entry point for hybrid-rag-qdrant
 */

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { load } from 'js-yaml';
import { RAGPipeline, type RAGPipelineConfig } from '../pipeline.js';
import { createMCPServer } from '../mcp-server/index.js';
import { ingestCommand, type IngestOptions } from './commands/ingest.js';
import { type QueryCommandOptions, queryCommand } from './commands/query.js';
import { evaluateCommand, type EvaluateOptions } from './commands/evaluate.js';
import { ablateCommand, type AblateOptions } from './commands/ablate.js';
import { benchmarkCommand, type BenchmarkOptions } from './commands/benchmark.js';
import { chunkCommand, type ChunkOptions } from './commands/chunk.js';

interface GlobalOptions {
  qdrantUrl: string;
  collection: string;
  config: string;
}

let pipeline: RAGPipeline | null = null;

async function readPackageVersion(): Promise<string> {
  const packagePaths = [
    new URL('../../package.json', import.meta.url),
    new URL('../../../package.json', import.meta.url),
  ];

  for (const path of packagePaths) {
    try {
      const pkgContent = await readFile(path, 'utf-8');
      return JSON.parse(pkgContent).version as string;
    } catch {
      // Try the next candidate path.
    }
  }

  return '0.1.0';
}

/**
 * Initialize pipeline from config
 */
async function initPipeline(options: GlobalOptions): Promise<RAGPipeline> {
  if (pipeline) {
    return pipeline;
  }

  let config: RAGPipelineConfig = {
    qdrantUrl: options.qdrantUrl || 'http://localhost:6333',
    collectionName: options.collection || 'documents',
  };

  if (options.config) {
    const configContent = await readFile(options.config, 'utf-8');
    const yamlConfig = load(configContent) as Record<string, unknown>;
    config = {
      ...config,
      ...yamlConfig,
    } as RAGPipelineConfig;
  }

  pipeline = new RAGPipeline(config);
  await pipeline.initialize();
  return pipeline;
}

async function main() {
  const program = new Command();

  const version = await readPackageVersion();

  program
    .name('hybrid-rag-qdrant')
    .description('Hybrid RAG CLI with Qdrant vector database')
    .version(version)
    .option('--qdrant-url <url>', 'Qdrant server URL', 'http://localhost:6333')
    .option('--collection <name>', 'Qdrant collection name', 'documents')
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
    .action(async (files: string[], options: IngestOptions, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      const p = await initPipeline(globalOpts);
      await ingestCommand(files, { ...options, ...globalOpts }, p);
    });

  program
    .command('query')
    .description('Query the RAG system')
    .argument('<query>', 'Search query')
    .option('--top-k <k>', 'Number of results', '10')
    .option('--rerank', 'Use reranker', true)
    .option('--vector-weight <weight>', 'Vector weight for hybrid search', '0.5')
    .option('--bm25-weight <weight>', 'BM25 weight for hybrid search', '0.5')
    .action(async (query: string, options: QueryCommandOptions, cmd) => {
      const globalOpts = cmd.parent.opts() as GlobalOptions;
      const p = await initPipeline(globalOpts);
      await queryCommand(query, { ...options, ...globalOpts }, p);
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

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

/**
 * Chunking strategy benchmarking
 */

import { getLogger } from '../observability/logger.js';
import type { ChunkingConfig, Document, EvaluationSample } from '../types/domain.js';
import { ChunkingStrategy } from '../types/domain.js';
import { ChunkingEngine } from './engine.js';

const logger = getLogger();

/**
 * Benchmark result for a single strategy
 */
export interface StrategyBenchmarkResult {
  strategy: ChunkingStrategy;
  config: ChunkingConfig;
  chunkingStats: {
    totalChunks: number;
    avgChunkSize: number;
    minChunkSize: number;
    maxChunkSize: number;
    totalTokens: number;
    processingTimeMs: number;
  };
  retrievalMetrics?: {
    precisionAt10: number;
    recallAt10: number;
    ndcgAt10: number;
    map: number;
    mrr: number;
  };
}

/**
 * Chunking benchmark comparison result
 */
export interface ChunkingBenchmarkResult {
  strategies: StrategyBenchmarkResult[];
  bestStrategy: {
    strategy: ChunkingStrategy;
    metric: string;
    value: number;
  };
  timestamp: string;
  documentCount: number;
}

/**
 * Options for chunking benchmark
 */
export interface ChunkingBenchmarkOptions {
  /** Strategies to benchmark (default: all) */
  strategies?: ChunkingStrategy[];
  /** Chunk size to use (default: 512) */
  chunkSize?: number;
  /** Overlap to use (default: 50) */
  overlap?: number;
  /** Whether to include retrieval metrics (requires eval dataset) */
  includeRetrievalMetrics?: boolean;
}

/**
 * Chunking strategy benchmark runner
 */
export class ChunkingBenchmark {
  private readonly engine: ChunkingEngine;

  constructor() {
    this.engine = new ChunkingEngine();
  }

  /**
   * Run benchmark on documents
   */
  benchmark(
    documents: Document[],
    options: ChunkingBenchmarkOptions = {},
  ): ChunkingBenchmarkResult {
    const strategies = options.strategies ?? Object.values(ChunkingStrategy);
    const chunkSize = options.chunkSize ?? 512;
    const overlap = options.overlap ?? 50;

    const results: StrategyBenchmarkResult[] = [];

    for (const strategy of strategies) {
      const config: ChunkingConfig = {
        strategy,
        chunkSize,
        overlap,
      };

      const startTime = performance.now();
      let totalChunks = 0;
      let totalTokens = 0;
      const chunkSizes: number[] = [];

      for (const doc of documents) {
        const result = this.engine.chunk(doc.content, doc.id, config);
        totalChunks += result.chunks.length;
        totalTokens += result.stats.totalTokens;

        for (const chunk of result.chunks) {
          chunkSizes.push(chunk.characterCount);
        }
      }

      const endTime = performance.now();
      const processingTimeMs = endTime - startTime;

      results.push({
        strategy,
        config,
        chunkingStats: {
          totalChunks,
          avgChunkSize:
            chunkSizes.length > 0
              ? Math.round(chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length)
              : 0,
          minChunkSize: chunkSizes.length > 0 ? Math.min(...chunkSizes) : 0,
          maxChunkSize: chunkSizes.length > 0 ? Math.max(...chunkSizes) : 0,
          totalTokens,
          processingTimeMs: Math.round(processingTimeMs * 100) / 100,
        },
      });
    }

    // Determine best strategy by chunk count (more chunks = better coverage)
    const bestByChunks = results.reduce((best, current) =>
      current.chunkingStats.totalChunks > best.chunkingStats.totalChunks ? current : best,
    );

    return {
      strategies: results,
      bestStrategy: {
        strategy: bestByChunks.strategy,
        metric: 'totalChunks',
        value: bestByChunks.chunkingStats.totalChunks,
      },
      timestamp: new Date().toISOString(),
      documentCount: documents.length,
    };
  }

  /**
   * Benchmark with retrieval evaluation
   */
  benchmarkWithEvaluation(
    documents: Document[],
    _evalSamples: EvaluationSample[],
    options: ChunkingBenchmarkOptions = {},
  ): ChunkingBenchmarkResult {
    // First run basic benchmark
    const result = this.benchmark(documents, options);

    // Note: Full retrieval evaluation would require a retrieval system
    // This is a placeholder for integration with the evaluation framework
    logger.warn('Retrieval metrics require a configured retrieval system');

    return result;
  }

  /**
   * Format benchmark results as markdown table
   */
  static formatAsMarkdown(result: ChunkingBenchmarkResult): string {
    const lines: string[] = [
      '# Chunking Strategy Benchmark Results',
      '',
      `**Documents:** ${result.documentCount}`,
      `**Timestamp:** ${result.timestamp}`,
      `**Best Strategy:** ${result.bestStrategy.strategy} (${result.bestStrategy.metric}: ${result.bestStrategy.value})`,
      '',
      '| Strategy | Chunks | Avg Size | Min Size | Max Size | Tokens | Time (ms) |',
      '|----------|--------|----------|----------|----------|--------|-----------|',
    ];

    for (const strategy of result.strategies) {
      const stats = strategy.chunkingStats;
      lines.push(
        `| ${strategy.strategy} | ${stats.totalChunks} | ${stats.avgChunkSize} | ${stats.minChunkSize} | ${stats.maxChunkSize} | ${stats.totalTokens} | ${stats.processingTimeMs} |`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Format benchmark results as JSON
   */
  static formatAsJson(result: ChunkingBenchmarkResult): string {
    return JSON.stringify(result, null, 2);
  }
}

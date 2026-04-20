/**
 * Benchmark reporting utilities
 */

import { writeFileSync } from 'fs';
import type { LatencyResult } from './latency.js';
import type { ThroughputResult } from './throughput.js';
import type { CostBreakdown } from './cost.js';

/**
 * Complete benchmark results
 */
export interface BenchmarkReport {
  /** Latency results */
  latency: LatencyResult;
  /** Throughput results */
  throughput: ThroughputResult[];
  /** Cost breakdown */
  cost: CostBreakdown;
  /** Metadata */
  metadata: {
    timestamp: string;
    environment: {
      nodeVersion: string;
      platform: string;
      arch: string;
    };
    configuration: Record<string, unknown>;
  };
}

/**
 * Generate markdown report from benchmark results
 */
export function generateMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];

  lines.push('# Benchmark Report\n');
  lines.push(`**Generated:** ${report.metadata.timestamp}\n`);

  // Latency section
  lines.push('## Latency\n');
  lines.push('| Metric | Value (ms) |');
  lines.push('|--------|------------|');
  lines.push(`| P50 | ${report.latency.p50.toFixed(2)} |`);
  lines.push(`| P90 | ${report.latency.p90.toFixed(2)} |`);
  lines.push(`| P95 | ${report.latency.p95.toFixed(2)} |`);
  lines.push(`| P99 | ${report.latency.p99.toFixed(2)} |`);
  lines.push(`| Mean | ${report.latency.mean.toFixed(2)} |`);
  lines.push(`| Std Dev | ${report.latency.stdDev.toFixed(2)} |`);
  lines.push(`| Min | ${report.latency.min.toFixed(2)} |`);
  lines.push(`| Max | ${report.latency.max.toFixed(2)} |\n`);

  // Throughput section
  lines.push('## Throughput\n');
  lines.push('| Concurrency | QPS | Total Queries | Time (ms) |');
  lines.push('|-------------|-----|---------------|-----------|');
  for (const result of report.throughput) {
    lines.push(
      `| ${result.concurrency} | ${result.qps.toFixed(2)} | ${result.totalQueries} | ${result.totalTime.toFixed(0)} |`,
    );
  }
  lines.push('');

  // Cost section
  lines.push('## Cost per Query\n');
  lines.push('| Component | Cost (USD) |');
  lines.push('|-----------|------------|');
  lines.push(`| Embedding | $${report.cost.embedding.toFixed(6)} |`);
  lines.push(`| Vector Search | $${report.cost.vectorSearch.toFixed(6)} |`);
  lines.push(`| BM25 Search | $${report.cost.bm25Search.toFixed(6)} |`);
  lines.push(`| Reranker | $${report.cost.reranker.toFixed(6)} |`);
  lines.push(`| **Total** | **$${report.cost.total.toFixed(6)}** |\n`);

  return lines.join('\n');
}

/**
 * Save benchmark report to file
 */
export function saveBenchmarkReport(report: BenchmarkReport, path: string): void {
  // Save JSON
  const jsonPath = path.endsWith('.json') ? path : `${path}.json`;
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Save markdown
  const mdPath = path.endsWith('.json') ? path.replace('.json', '.md') : `${path}.md`;
  const markdown = generateMarkdownReport(report);
  writeFileSync(mdPath, markdown);
}

/**
 * Get environment info
 */
export function getEnvironmentInfo(): BenchmarkReport['metadata']['environment'] {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * Create a benchmark report
 */
export function createBenchmarkReport(options: {
  latency: LatencyResult;
  throughput: ThroughputResult[];
  cost: CostBreakdown;
  configuration?: Record<string, unknown>;
}): BenchmarkReport {
  return {
    latency: options.latency,
    throughput: options.throughput,
    cost: options.cost,
    metadata: {
      timestamp: new Date().toISOString(),
      environment: getEnvironmentInfo(),
      configuration: options.configuration ?? {},
    },
  };
}

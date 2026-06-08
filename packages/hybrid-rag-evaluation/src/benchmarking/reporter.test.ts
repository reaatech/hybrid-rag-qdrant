import { describe, expect, it, vi } from 'vitest';
import type { CostBreakdown } from './cost.js';
import type { LatencyResult } from './latency.js';
import {
  createBenchmarkReport,
  generateMarkdownReport,
  getEnvironmentInfo,
  saveBenchmarkReport,
} from './reporter.js';
import type { ThroughputResult } from './throughput.js';

const writeFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ writeFileSync }));

const latency: LatencyResult = {
  latencies: [1, 2, 3],
  p50: 2,
  p90: 3,
  p95: 3,
  p99: 3,
  mean: 2,
  stdDev: 0.8,
  min: 1,
  max: 3,
};

const throughput: ThroughputResult[] = [
  { qps: 12.5, totalQueries: 100, totalTime: 8000, concurrency: 4 },
];

const cost: CostBreakdown = {
  embedding: 0.01,
  vectorSearch: 0.02,
  bm25Search: 0,
  reranker: 0.03,
  total: 0.06,
};

describe('getEnvironmentInfo', () => {
  it('returns runtime info', () => {
    const info = getEnvironmentInfo();
    expect(info.nodeVersion).toBe(process.version);
    expect(info.platform).toBe(process.platform);
    expect(info.arch).toBe(process.arch);
  });
});

describe('createBenchmarkReport', () => {
  it('builds a report with metadata defaults', () => {
    const report = createBenchmarkReport({ latency, throughput, cost });
    expect(report.latency).toBe(latency);
    expect(report.throughput).toBe(throughput);
    expect(report.cost).toBe(cost);
    expect(report.metadata.configuration).toEqual({});
    expect(report.metadata.timestamp).toBeTypeOf('string');
  });

  it('preserves provided configuration', () => {
    const report = createBenchmarkReport({
      latency,
      throughput,
      cost,
      configuration: { topK: 10 },
    });
    expect(report.metadata.configuration).toEqual({ topK: 10 });
  });
});

describe('generateMarkdownReport', () => {
  it('renders latency, throughput and cost sections', () => {
    const report = createBenchmarkReport({ latency, throughput, cost });
    const md = generateMarkdownReport(report);
    expect(md).toContain('# Benchmark Report');
    expect(md).toContain('## Latency');
    expect(md).toContain('## Throughput');
    expect(md).toContain('| 4 | 12.50 | 100 | 8000 |');
    expect(md).toContain('**$0.060000**');
  });
});

describe('saveBenchmarkReport', () => {
  it('writes json and markdown for a plain path', () => {
    writeFileSync.mockClear();
    const report = createBenchmarkReport({ latency, throughput, cost });
    saveBenchmarkReport(report, '/tmp/out');
    expect(writeFileSync).toHaveBeenCalledTimes(2);
    expect(writeFileSync.mock.calls[0]![0]).toBe('/tmp/out.json');
    expect(writeFileSync.mock.calls[1]![0]).toBe('/tmp/out.md');
  });

  it('handles a .json path by deriving the markdown name', () => {
    writeFileSync.mockClear();
    const report = createBenchmarkReport({ latency, throughput, cost });
    saveBenchmarkReport(report, '/tmp/out.json');
    expect(writeFileSync.mock.calls[0]![0]).toBe('/tmp/out.json');
    expect(writeFileSync.mock.calls[1]![0]).toBe('/tmp/out.md');
  });
});

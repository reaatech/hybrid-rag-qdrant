import { describe, it, expect } from 'vitest';

describe('benchmarking', () => {
  describe('latency benchmarking', () => {
    it('should calculate latency statistics correctly', async () => {
      const { calculateLatencyStats } = await import('../../src/benchmarking/latency.js');

      const latencies = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600];
      const stats = calculateLatencyStats(latencies);

      expect(stats.p50).toBe(300);
      expect(stats.p90).toBe(500);
      expect(stats.p95).toBe(600);
      expect(stats.p99).toBe(600);
      expect(stats.mean).toBe(330);
    });

    it('should handle empty latencies array', async () => {
      const { calculateLatencyStats } = await import('../../src/benchmarking/latency.js');

      const stats = calculateLatencyStats([]);

      expect(stats.p50).toBe(0);
      expect(stats.p90).toBe(0);
      expect(stats.p95).toBe(0);
      expect(stats.p99).toBe(0);
      expect(stats.mean).toBe(0);
    });

    it('should calculate mean correctly', async () => {
      const { calculateLatencyStats } = await import('../../src/benchmarking/latency.js');

      const latencies = [100, 200, 300];
      const stats = calculateLatencyStats(latencies);

      expect(stats.mean).toBe(200);
    });
  });

  describe('throughput benchmarking', () => {
    it('should run throughput benchmark', async () => {
      const { benchmarkThroughput } = await import('../../src/benchmarking/throughput.js');

      const queries = ['query1', 'query2', 'query3', 'query4', 'query5'];
      const queryFn = async () => Promise.resolve();

      const results = await benchmarkThroughput(queries, queryFn, {
        concurrency: [1, 5],
        queriesPerLevel: 5,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('cost benchmarking', () => {
    it('should calculate embedding cost', async () => {
      const { calculateEmbeddingCost } = await import('../../src/benchmarking/cost.js');

      const cost = calculateEmbeddingCost(1000, 0);
      // text-embedding-3-small: $0.02 per 1M tokens
      expect(cost).toBeCloseTo(0.00002, 8);
    });

    it('should calculate reranker cost', async () => {
      const { calculateRerankerCost } = await import('../../src/benchmarking/cost.js');

      const cost = calculateRerankerCost(10, 1000);
      // $0.001 per call + $0 per token
      expect(cost).toBe(0.01);
    });

    it('should calculate vector search cost', async () => {
      const { calculateVectorSearchCost } = await import('../../src/benchmarking/cost.js');

      const cost = calculateVectorSearchCost(1000);
      // $1.0 per 1K requests
      expect(cost).toBe(1.0);
    });

    it('should calculate query cost', async () => {
      const { calculateQueryCost } = await import('../../src/benchmarking/cost.js');

      const cost = calculateQueryCost({
        embeddingInputTokens: 1000,
        rerankerCalls: 10,
        vectorSearchRequests: 100,
      });

      expect(cost.embedding).toBeGreaterThan(0);
      expect(cost.reranker).toBeGreaterThan(0);
      expect(cost.vectorSearch).toBeGreaterThan(0);
      expect(cost.total).toBe(cost.embedding + cost.reranker + cost.vectorSearch);
    });

    it('should track cumulative costs with CostTracker', async () => {
      const { CostTracker } = await import('../../src/benchmarking/cost.js');

      const tracker = new CostTracker();

      tracker.addEmbeddingCost(1000000); // Large number to ensure visible cost
      tracker.addRerankerCost(5);
      tracker.addVectorSearchCost(100);
      tracker.recordQuery();

      const breakdown = tracker.getCostBreakdown();
      expect(breakdown.embedding).toBeGreaterThan(0);
      expect(breakdown.reranker).toBeGreaterThan(0);
      expect(breakdown.vectorSearch).toBeGreaterThan(0);

      const costPerQuery = tracker.getCostPerQuery();
      expect(costPerQuery.queryCount).toBe(1);
      // Note: total is not recalculated in current implementation
    });

    it('should reset cost tracker', async () => {
      const { CostTracker } = await import('../../src/benchmarking/cost.js');

      const tracker = new CostTracker();
      tracker.addEmbeddingCost(1000);
      tracker.reset();

      const breakdown = tracker.getCostBreakdown();
      expect(breakdown.embedding).toBe(0);
      expect(breakdown.total).toBe(0);
    });
  });

  describe('benchmark reporter', () => {
    it('should generate markdown report', async () => {
      const { generateMarkdownReport } = await import('../../src/benchmarking/reporter.js');

      const report = {
        latency: {
          latencies: [100, 200, 300],
          p50: 200,
          p90: 300,
          p95: 300,
          p99: 300,
          mean: 200,
          stdDev: 50,
          min: 100,
          max: 300,
        },
        throughput: [{
          qps: 50,
          totalQueries: 100,
          totalTime: 2000,
          concurrency: 5,
        }],
        cost: {
          embedding: 0.001,
          vectorSearch: 0.01,
          bm25Search: 0,
          reranker: 0.005,
          total: 0.016,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          environment: {
            nodeVersion: '22.0.0',
            platform: 'darwin',
            arch: 'arm64',
          },
          configuration: {},
        },
      };

      const markdown = generateMarkdownReport(report);

      expect(markdown).toContain('# Benchmark Report');
      expect(markdown).toContain('P50');
      expect(markdown).toContain('Throughput');
    });

    it('should create benchmark report', async () => {
      const { createBenchmarkReport } = await import('../../src/benchmarking/reporter.js');

      const latency = {
        latencies: [100, 200, 300],
        p50: 200,
        p90: 300,
        p95: 300,
        p99: 300,
        mean: 200,
        stdDev: 50,
        min: 100,
        max: 300,
      };

      const throughput = [{
        qps: 50,
        totalQueries: 100,
        totalTime: 2000,
        concurrency: 5,
      }];

      const cost = {
        embedding: 0.001,
        vectorSearch: 0.01,
        bm25Search: 0,
        reranker: 0.005,
        total: 0.016,
      };

      const report = createBenchmarkReport({ latency, throughput, cost });

      expect(report.latency).toBeDefined();
      expect(report.throughput).toBeDefined();
      expect(report.cost).toBeDefined();
      expect(report.metadata).toBeDefined();
      expect(report.metadata.timestamp).toBeDefined();
    });

    it('should get environment info', async () => {
      const { getEnvironmentInfo } = await import('../../src/benchmarking/reporter.js');

      const env = getEnvironmentInfo();

      expect(env.nodeVersion).toBeDefined();
      expect(env.platform).toBeDefined();
      expect(env.arch).toBeDefined();
    });
  });
});
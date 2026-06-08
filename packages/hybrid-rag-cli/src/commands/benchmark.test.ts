import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const benchmarkLatencyMock = vi.fn();
const benchmarkThroughputMock = vi.fn();
const getEnvironmentInfoMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag-evaluation', () => ({
  benchmarkLatency: (...args: unknown[]) => benchmarkLatencyMock(...args),
  benchmarkThroughput: (...args: unknown[]) => benchmarkThroughputMock(...args),
  getEnvironmentInfo: (...args: unknown[]) => getEnvironmentInfoMock(...args),
}));

import { writeFile } from 'node:fs/promises';
import { benchmarkCommand } from './benchmark.js';

const writeFileMock = vi.mocked(writeFile);

const latency = {
  mean: 12.345,
  p50: 10,
  p95: 20,
  p99: 30,
  min: 5,
  max: 40,
};

const options = {
  output: 'bench.json',
  queries: 100,
  iterations: 3,
  collection: 'documents',
};

describe('benchmarkCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    benchmarkLatencyMock.mockReset();
    benchmarkThroughputMock.mockReset();
    getEnvironmentInfoMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined as never);
    getEnvironmentInfoMock.mockReturnValue({ node: 'test' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs latency and throughput benchmarks and writes results', async () => {
    benchmarkLatencyMock.mockResolvedValue(latency);
    benchmarkThroughputMock.mockResolvedValue([{ qps: 42 }]);
    const pipeline = { query: vi.fn().mockResolvedValue([]) };

    await benchmarkCommand('', options, pipeline as never);

    // invoke the queryFn passed to latency benchmark (success path)
    const queryFn = benchmarkLatencyMock.mock.calls[0][1] as (q: string) => Promise<void>;
    await queryFn('a question');
    expect(pipeline.query).toHaveBeenCalledWith('a question', { topK: 5 });

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [path, body] = writeFileMock.mock.calls[0];
    expect(path).toBe('bench.json');
    const parsed = JSON.parse(body as string);
    expect(parsed.latency.avg_ms).toBe(12.35);
    expect(parsed.throughput.queries_per_second).toBe(42);
    expect(parsed.environment).toEqual({ node: 'test' });

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Average Latency: 12.35ms');
    expect(out).toContain('Results saved to: bench.json');
  });

  it('handles empty throughput results and query failures', async () => {
    benchmarkLatencyMock.mockResolvedValue(latency);
    benchmarkThroughputMock.mockResolvedValue([]);
    const pipeline = { query: vi.fn().mockRejectedValue(new Error('q fail')) };

    await benchmarkCommand('', options, pipeline as never);

    const queryFn = benchmarkLatencyMock.mock.calls[0][1] as (q: string) => Promise<void>;
    await queryFn('failing');
    expect(errorSpy).toHaveBeenCalledWith('Query failed: failing', expect.any(Error));

    const body = writeFileMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(body);
    expect(parsed.throughput.queries_per_second).toBe(0);
  });
});

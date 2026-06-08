import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const benchmarkVectorStoresMock = vi.fn();
const validateVectorStoreConfigMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag', () => ({
  validateVectorStoreConfig: (...args: unknown[]) => validateVectorStoreConfigMock(...args),
}));

vi.mock('@reaatech/hybrid-rag-evaluation', () => ({
  benchmarkVectorStores: (...args: unknown[]) => benchmarkVectorStoresMock(...args),
}));

import { readFile, writeFile } from 'node:fs/promises';
import { benchmarkDbCommand } from './benchmark-db.js';

const readFileMock = vi.mocked(readFile);
const writeFileMock = vi.mocked(writeFile);

describe('benchmarkDbCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    benchmarkVectorStoresMock.mockReset();
    validateVectorStoreConfigMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined as never);
    validateVectorStoreConfigMock.mockImplementation((c: Record<string, unknown>) => c);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when --configs is missing', async () => {
    await expect(
      benchmarkDbCommand({ configs: '', queries: '', iterations: 10, output: '' }),
    ).rejects.toThrow('--configs is required');
  });

  it('reads configs and queries, benchmarks, and writes results', async () => {
    readFileMock
      .mockResolvedValueOnce(JSON.stringify({ provider: 'qdrant' }) as never)
      .mockResolvedValueOnce(JSON.stringify({ provider: 'lancedb' }) as never)
      .mockResolvedValueOnce(JSON.stringify([{ query: 'q1', relevantChunkIds: ['a'] }]) as never);
    benchmarkVectorStoresMock.mockResolvedValue([
      {
        provider: 'qdrant',
        avgLatencyMs: 1.5,
        p95LatencyMs: 2.5,
        throughputQPS: 100,
        avgRecallAt10: 0.9,
        costPerQuery: 0.000123,
      },
    ]);

    await benchmarkDbCommand({
      configs: 'a.json, b.json',
      queries: 'queries.json',
      iterations: '5',
      output: 'result.json',
    });

    expect(readFileMock).toHaveBeenCalledTimes(3);
    expect(validateVectorStoreConfigMock).toHaveBeenCalledTimes(2);
    expect(benchmarkVectorStoresMock).toHaveBeenCalledWith(
      [{ provider: 'qdrant' }, { provider: 'lancedb' }],
      [{ query: 'q1', relevantChunkIds: ['a'] }],
      { iterations: 5 },
    );
    expect(writeFileMock).toHaveBeenCalledWith('result.json', expect.any(String));

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Benchmarking 2 vector store configurations');
    expect(out).toContain('Queries: 1');
    expect(out).toContain('qdrant:');
    expect(out).toContain('Avg Latency: 1.50ms');
    expect(out).toContain('Cost/Query: $0.000123');
    expect(out).toContain('Results saved to: result.json');
  });

  it('defaults iterations and output path, and handles no queries', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({ provider: 'sandbox' }) as never);
    benchmarkVectorStoresMock.mockResolvedValue([]);

    await benchmarkDbCommand({
      configs: 'only.json',
      queries: '',
      iterations: undefined as never,
      output: '',
    });

    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(benchmarkVectorStoresMock).toHaveBeenCalledWith([{ provider: 'sandbox' }], [], {
      iterations: 10,
    });
    expect(writeFileMock).toHaveBeenCalledWith('benchmark-db-results.json', expect.any(String));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const evaluateMock = vi.fn();
const loadEvaluationDatasetMock = vi.fn();
const runnerCtor = vi.fn();

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag-evaluation', () => ({
  loadEvaluationDataset: (...args: unknown[]) => loadEvaluationDatasetMock(...args),
  EvaluationRunner: class {
    evaluate = evaluateMock;
    constructor(...args: unknown[]) {
      runnerCtor(...args);
    }
  },
}));

import { writeFile } from 'node:fs/promises';
import { evaluateCommand } from './evaluate.js';

const writeFileMock = vi.mocked(writeFile);

describe('evaluateCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    evaluateMock.mockReset();
    loadEvaluationDatasetMock.mockReset();
    runnerCtor.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads dataset, runs evaluation, writes results and prints metrics', async () => {
    loadEvaluationDatasetMock.mockReturnValue({ samples: [{}, {}, {}] });
    evaluateMock.mockResolvedValue({
      summary: { totalQueries: 3, evaluatedQueries: 3, timestamp: 'ts' },
      metrics: {
        precisionAtK: 0.5,
        recallAtK: 0.6,
        ndcgAtK: 0.7,
        map: 0.8,
        mrr: 0.9,
      },
    });

    const pipeline = { query: vi.fn() };

    await evaluateCommand(
      'dataset.jsonl',
      { output: 'out.json', metrics: 'precision', collection: 'documents' },
      pipeline as never,
    );

    expect(loadEvaluationDatasetMock).toHaveBeenCalledWith('dataset.jsonl');
    expect(runnerCtor).toHaveBeenCalledWith(expect.any(Function), { topK: 10 });
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [path, body] = writeFileMock.mock.calls[0];
    expect(path).toBe('out.json');
    const parsed = JSON.parse(body as string);
    expect(parsed.metrics.precision_at_10).toBe(0.5);
    expect(parsed.total_queries).toBe(3);

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Loaded 3 test queries.');
    expect(out).toContain('Precision@10: 0.5000');
    expect(out).toContain('MRR: 0.9000');
    expect(out).toContain('Results saved to: out.json');
  });
});

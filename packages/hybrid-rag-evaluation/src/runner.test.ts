import { describe, expect, it, vi } from 'vitest';
import type { EvaluationDataset } from './dataset/loader.js';
import { EvaluationRunner, runEvaluation } from './runner.js';

const writeFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ writeFileSync }));

function makeDataset(): EvaluationDataset {
  return {
    samples: [
      { queryId: 'q1', query: 'first', relevantDocs: ['d1'], relevantChunks: ['c1'] },
      { queryId: 'q2', query: 'second', relevantDocs: ['d2'], relevantChunks: [] },
    ],
    metadata: { totalSamples: 2 },
  };
}

describe('EvaluationRunner', () => {
  it('evaluates samples and aggregates metrics', async () => {
    writeFileSync.mockClear();
    const queryFn = vi.fn(async (query: string) => {
      if (query === 'first') return [{ chunkId: 'c1' } as never];
      return [{ chunkId: 'd2' } as never];
    });

    const runner = new EvaluationRunner(queryFn);
    const results = await runner.evaluate(makeDataset());

    expect(results.perQueryResults).toHaveLength(2);
    expect(results.summary.totalQueries).toBe(2);
    expect(results.summary.evaluatedQueries).toBe(2);
    // q1 matches relevant chunk c1; q2 falls back to relevant docs d2
    expect(results.metrics.precisionAtK).toBeGreaterThan(0);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('exposes the resolved config', () => {
    const runner = new EvaluationRunner(vi.fn(), { topK: 5, metrics: ['precision'] });
    const config = runner.getConfig();
    expect(config.topK).toBe(5);
    expect(config.metrics).toEqual(['precision']);
  });

  it('does not write output when outputPath is empty', async () => {
    writeFileSync.mockClear();
    const queryFn = vi.fn(async () => [] as never[]);
    const runner = new EvaluationRunner(queryFn, { outputPath: '' });
    await runner.evaluate(makeDataset());
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('passes topK to the query function', async () => {
    writeFileSync.mockClear();
    const queryFn = vi.fn(async () => [] as never[]);
    const runner = new EvaluationRunner(queryFn, { topK: 3 });
    await runner.evaluate(makeDataset());
    expect(queryFn).toHaveBeenCalledWith('first', { topK: 3 });
  });
});

describe('runEvaluation', () => {
  it('runs through the convenience wrapper', async () => {
    writeFileSync.mockClear();
    const queryFn = vi.fn(async () => [{ chunkId: 'c1' } as never]);
    const results = await runEvaluation(makeDataset(), queryFn, { outputPath: '' });
    expect(results.summary.evaluatedQueries).toBe(2);
  });
});

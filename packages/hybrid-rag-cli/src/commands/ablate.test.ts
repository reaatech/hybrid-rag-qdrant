import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runMock = vi.fn();
const ablationCtor = vi.fn();
const loadEvaluationDatasetMock = vi.fn();
const yamlParseMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag-evaluation', () => ({
  loadEvaluationDataset: (...args: unknown[]) => loadEvaluationDatasetMock(...args),
  AblationRunner: class {
    run = runMock;
    constructor(...args: unknown[]) {
      ablationCtor(...args);
    }
  },
}));

vi.mock('yaml', () => ({
  parse: (...args: unknown[]) => yamlParseMock(...args),
}));

import { readFile } from 'node:fs/promises';
import { ablateCommand } from './ablate.js';

const readFileMock = vi.mocked(readFile);

describe('ablateCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runMock.mockReset();
    ablationCtor.mockReset();
    loadEvaluationDatasetMock.mockReset();
    yamlParseMock.mockReset();
    readFileMock.mockReset();
    readFileMock.mockResolvedValue('yaml-content' as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses config, runs ablation and prints variant metrics', async () => {
    yamlParseMock.mockReturnValue({ baseline: {}, variants: [{ name: 'v1' }, { name: 'v2' }] });
    loadEvaluationDatasetMock.mockReturnValue({ samples: [{}, {}] });
    runMock.mockResolvedValue({
      variants: [
        {
          variant: { name: 'baseline' },
          metrics: { precisionAtK: 0.1, recallAtK: 0.2, ndcgAtK: 0.3 },
        },
      ],
    });

    const pipeline = { query: vi.fn().mockResolvedValue([{ id: 'x' }]) };

    await ablateCommand(
      'config.yaml',
      'dataset.jsonl',
      { output: 'ablation.json', collection: 'documents' },
      pipeline as never,
    );

    expect(readFileMock).toHaveBeenCalledWith('config.yaml', 'utf-8');
    expect(yamlParseMock).toHaveBeenCalledWith('yaml-content');
    expect(ablationCtor).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith({ samples: [{}, {}] }, 'ablation.json');

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Running ablation study...');
    expect(out).toContain('Configurations: 2');
    expect(out).toContain('baseline:');
    expect(out).toContain('Precision@10: 0.1000');
    expect(out).toContain('Results saved to: ablation.json');
  });

  it('exercises the pipelineBuilder query success path', async () => {
    yamlParseMock.mockReturnValue({ baseline: {}, variants: [] });
    loadEvaluationDatasetMock.mockReturnValue({ samples: [] });
    const pipeline = { query: vi.fn().mockResolvedValue([{ id: 'r1' }]) };

    let captured: (() => Promise<{ query: (q: string) => Promise<unknown> }>) | undefined;
    runMock.mockImplementation(async () => ({ variants: [] }));
    ablationCtor.mockImplementation((_cfg: unknown, builder: () => Promise<never>) => {
      captured = builder as never;
    });

    await ablateCommand(
      'config.yaml',
      'dataset.jsonl',
      { output: 'ablation.json', collection: 'documents' },
      pipeline as never,
    );

    const built = await captured?.();
    const result = await built?.query('a very long query string for truncation testing here too');
    expect(result).toEqual([{ id: 'r1' }]);
    expect(pipeline.query).toHaveBeenCalledWith(
      'a very long query string for truncation testing here too',
      { topK: 10 },
    );
  });

  it('exercises the pipelineBuilder query failure path returning empty results', async () => {
    yamlParseMock.mockReturnValue({ baseline: {}, variants: [] });
    loadEvaluationDatasetMock.mockReturnValue({ samples: [] });
    const pipeline = { query: vi.fn().mockRejectedValue(new Error('query boom')) };

    let captured: (() => Promise<{ query: (q: string) => Promise<unknown> }>) | undefined;
    runMock.mockResolvedValue({ variants: [] });
    ablationCtor.mockImplementation((_cfg: unknown, builder: () => Promise<never>) => {
      captured = builder as never;
    });

    await ablateCommand(
      'config.yaml',
      'dataset.jsonl',
      { output: 'ablation.json', collection: 'documents' },
      pipeline as never,
    );

    const built = await captured?.();
    const result = await built?.query('q');
    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('  [Ablation] Query failed:', expect.any(Error));
    // cleanup is a no-op but should be callable
    await (built as unknown as { cleanup: () => Promise<void> }).cleanup();
  });
});

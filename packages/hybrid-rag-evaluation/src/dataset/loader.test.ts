import { describe, expect, it, vi } from 'vitest';
import {
  type EvaluationDataset,
  loadEvaluationConfig,
  loadEvaluationDataset,
  splitDataset,
  validateEvaluationSample,
} from './loader.js';

const readFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ readFileSync }));

describe('loadEvaluationDataset', () => {
  it('parses JSONL lines, skipping blanks', () => {
    readFileSync.mockReturnValue(
      [
        JSON.stringify({
          query_id: 'q1',
          query: 'what?',
          relevant_docs: ['d1'],
          relevant_chunks: ['c1'],
          ideal_answer: 'because',
        }),
        '',
        JSON.stringify({ query_id: 'q2', query: 'how?' }),
      ].join('\n'),
    );

    const dataset = loadEvaluationDataset('/path.jsonl');
    expect(dataset.samples).toHaveLength(2);
    expect(dataset.metadata.totalSamples).toBe(2);
    expect(dataset.samples[0]).toEqual({
      queryId: 'q1',
      query: 'what?',
      relevantDocs: ['d1'],
      relevantChunks: ['c1'],
      idealAnswer: 'because',
    });
    // defaults applied to second sample
    expect(dataset.samples[1]!.relevantDocs).toEqual([]);
    expect(dataset.samples[1]!.relevantChunks).toEqual([]);
  });
});

describe('loadEvaluationConfig', () => {
  it('parses YAML content', () => {
    readFileSync.mockReturnValue('topK: 5\nname: test');
    const config = loadEvaluationConfig<{ topK: number; name: string }>('/c.yaml');
    expect(config.topK).toBe(5);
    expect(config.name).toBe('test');
  });
});

describe('validateEvaluationSample', () => {
  it('accepts a valid sample', () => {
    expect(
      validateEvaluationSample({
        queryId: 'q1',
        query: 'q',
        relevantDocs: ['d'],
        relevantChunks: [],
      }),
    ).toBe(true);
  });

  it('rejects missing query id', () => {
    expect(
      validateEvaluationSample({
        queryId: '',
        query: 'q',
        relevantDocs: ['d'],
        relevantChunks: [],
      }),
    ).toBe(false);
  });

  it('rejects when both relevant lists are empty', () => {
    expect(
      validateEvaluationSample({
        queryId: 'q1',
        query: 'q',
        relevantDocs: [],
        relevantChunks: [],
      }),
    ).toBe(false);
  });

  it('accepts when only relevant chunks present', () => {
    expect(
      validateEvaluationSample({
        queryId: 'q1',
        query: 'q',
        relevantDocs: [],
        relevantChunks: ['c'],
      }),
    ).toBe(true);
  });

  it('rejects an empty query', () => {
    expect(
      validateEvaluationSample({
        queryId: 'q1',
        query: '',
        relevantDocs: ['d'],
        relevantChunks: [],
      }),
    ).toBe(false);
  });
});

describe('splitDataset', () => {
  const dataset: EvaluationDataset = {
    samples: Array.from({ length: 10 }, (_, i) => ({
      queryId: `q${i}`,
      query: `query ${i}`,
      relevantDocs: ['d'],
      relevantChunks: [],
    })),
    metadata: { name: 'ds', totalSamples: 10 },
  };

  it('splits deterministically by ratio', () => {
    const { train, test } = splitDataset(dataset, 0.2);
    expect(train.samples).toHaveLength(8);
    expect(test.samples).toHaveLength(2);
    expect(train.metadata.totalSamples).toBe(8);
    expect(test.metadata.totalSamples).toBe(2);
  });

  it('is stable across calls with the same seed', () => {
    const a = splitDataset(dataset, 0.3, 7);
    const b = splitDataset(dataset, 0.3, 7);
    expect(a.train.samples.map((s) => s.queryId)).toEqual(b.train.samples.map((s) => s.queryId));
  });

  it('uses default ratio and seed', () => {
    const { train, test } = splitDataset(dataset);
    expect(train.samples.length + test.samples.length).toBe(10);
  });
});

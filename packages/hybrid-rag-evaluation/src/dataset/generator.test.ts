import { describe, expect, it, vi } from 'vitest';
import { generateAndSaveDataset, generateDataset } from './generator.js';

const writeFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('node:fs/promises', () => ({ writeFile }));

vi.mock('@reaatech/hybrid-rag-observability', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('generateDataset', () => {
  it('produces deterministic output for a fixed seed', async () => {
    writeFile.mockClear();
    const a = await generateDataset({
      numQueries: 5,
      numDocuments: 10,
      relevantDocsPerQuery: 3,
      outputPath: '/tmp/a.jsonl',
      seed: 123,
    });
    const b = await generateDataset({
      numQueries: 5,
      numDocuments: 10,
      relevantDocsPerQuery: 3,
      outputPath: '/tmp/b.jsonl',
      seed: 123,
    });

    expect(a.queries).toHaveLength(5);
    expect(a.documents).toHaveLength(10);
    expect(a.queries.map((q) => q.query)).toEqual(b.queries.map((q) => q.query));
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it('assigns relevant docs up to the requested count', async () => {
    writeFile.mockClear();
    const result = await generateDataset({
      numQueries: 2,
      numDocuments: 20,
      relevantDocsPerQuery: 4,
      outputPath: '/tmp/c.jsonl',
      seed: 1,
    });
    for (const q of result.queries) {
      expect(q.relevant_docs.length).toBeLessThanOrEqual(4);
      expect(q.relevant_docs.length).toBeGreaterThan(0);
      // ids are unique
      expect(new Set(q.relevant_docs).size).toBe(q.relevant_docs.length);
    }
  });

  it('caps relevant docs to corpus size when requesting more than available', async () => {
    writeFile.mockClear();
    const result = await generateDataset({
      numQueries: 1,
      numDocuments: 2,
      relevantDocsPerQuery: 5,
      outputPath: '/tmp/d.jsonl',
      seed: 2,
    });
    expect(result.queries[0]!.relevant_docs.length).toBeLessThanOrEqual(2);
  });

  it('works without an explicit seed', async () => {
    writeFile.mockClear();
    const result = await generateDataset({
      numQueries: 1,
      numDocuments: 3,
      relevantDocsPerQuery: 1,
      outputPath: '/tmp/e.jsonl',
    });
    expect(result.queries).toHaveLength(1);
  });
});

describe('generateAndSaveDataset', () => {
  it('uses default options', async () => {
    writeFile.mockClear();
    await generateAndSaveDataset('/tmp/out.jsonl');
    expect(writeFile).toHaveBeenCalledTimes(1);
    const content = writeFile.mock.calls[0]![1] as string;
    // 50 queries by default => 50 JSONL lines
    expect(content.split('\n')).toHaveLength(50);
  });

  it('honors provided options including seed', async () => {
    writeFile.mockClear();
    await generateAndSaveDataset('/tmp/out2.jsonl', {
      numQueries: 3,
      numDocuments: 5,
      relevantDocsPerQuery: 2,
      seed: 99,
    });
    const content = writeFile.mock.calls[0]![1] as string;
    expect(content.split('\n')).toHaveLength(3);
  });
});

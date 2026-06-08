import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryCommand } from './query.js';

interface MockPipeline {
  query: ReturnType<typeof vi.fn>;
}

function makePipeline(results: unknown[]): MockPipeline {
  return { query: vi.fn().mockResolvedValue(results) };
}

describe('queryCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses options and prints formatted results', async () => {
    const results = [
      {
        score: 0.987654,
        chunkId: 'chunk-1',
        content: 'a'.repeat(300),
        metadata: { source: 'doc.md' },
      },
      {
        score: 0.5,
        chunkId: 'chunk-2',
        content: 'short content',
        metadata: {},
      },
    ];
    const pipeline = makePipeline(results);

    await queryCommand(
      'hello world',
      { topK: '5', rerank: true, vectorWeight: '0.7', bm25Weight: '0.3' },
      pipeline as never,
    );

    expect(pipeline.query).toHaveBeenCalledWith('hello world', {
      topK: 5,
      useReranker: true,
      vectorWeight: 0.7,
      bm25Weight: 0.3,
    });
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Querying: "hello world"');
    expect(output).toContain('Found 2 results');
    expect(output).toContain('Score: 0.9877');
    expect(output).toContain('Source: doc.md');
  });

  it('handles numeric option values', async () => {
    const pipeline = makePipeline([{ score: 1, chunkId: 'x', content: 'c', metadata: undefined }]);
    await queryCommand(
      'q',
      { topK: 3, rerank: false, vectorWeight: 0.4, bm25Weight: 0.6 },
      pipeline as never,
    );
    expect(pipeline.query).toHaveBeenCalledWith('q', {
      topK: 3,
      useReranker: false,
      vectorWeight: 0.4,
      bm25Weight: 0.6,
    });
  });

  it('prints "No results found." when empty', async () => {
    const pipeline = makePipeline([]);
    await queryCommand(
      'nothing',
      { topK: '10', rerank: true, vectorWeight: '0.5', bm25Weight: '0.5' },
      pipeline as never,
    );
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No results found.');
  });
});

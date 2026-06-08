import { describe, expect, it, vi } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  ragBM25Search,
  ragRerank,
  ragRetrieve,
  ragVectorSearch,
  retrievalTools,
} from './retrieval.js';

const sampleResults = [
  { chunkId: 'c1', score: 0.9, content: 'hello', metadata: { a: 1 }, source: 'vector' },
  { chunkId: 'c2', score: 0.5, content: 'world', metadata: { b: 2 }, source: 'bm25' },
];

describe('retrievalTools registry', () => {
  it('exports four tools', () => {
    expect(retrievalTools.map((t) => t.name)).toEqual([
      'rag.retrieve',
      'rag.vector_search',
      'rag.bm25_search',
      'rag.rerank',
    ]);
  });
});

describe('rag.retrieve', () => {
  it('returns mapped results from the pipeline', async () => {
    const query = vi.fn().mockResolvedValue(sampleResults);
    const pipeline = makePipeline({ query });
    const res = await ragRetrieve.handler({ query: 'hi' }, pipeline);
    const payload = parseToolResult(res);
    expect(payload.count).toBe(2);
    expect((payload.results as unknown[])[0]).toMatchObject({ chunkId: 'c1', source: 'vector' });
    expect(query).toHaveBeenCalledWith('hi', expect.any(Object));
  });

  it('forwards optional weights, reranker, filter and provider overrides', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const pipeline = makePipeline({ query });
    await ragRetrieve.handler(
      {
        query: 'hi',
        topK: 3,
        useReranker: true,
        vectorWeight: 0.6,
        bm25Weight: 0.4,
        filter: { category: 'docs' },
        vectorStoreProvider: 'pinecone',
        vectorStoreConfig: { provider: 'sandbox' },
      },
      pipeline,
    );
    const opts = query.mock.calls[0][1];
    expect(opts).toMatchObject({
      topK: 3,
      useReranker: true,
      vectorWeight: 0.6,
      bm25Weight: 0.4,
      vectorStoreProvider: 'pinecone',
    });
    expect(opts.vectorStore).toEqual({ provider: 'sandbox' });
  });

  it('returns validation error for missing query', async () => {
    const pipeline = makePipeline({ query: vi.fn() });
    const res = await ragRetrieve.handler({}, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Invalid input');
  });

  it('returns validation error for invalid weight range', async () => {
    const pipeline = makePipeline({ query: vi.fn() });
    const res = await ragRetrieve.handler({ query: 'hi', vectorWeight: 5 }, pipeline);
    expect(res.isError).toBe(true);
  });

  it('handles pipeline errors gracefully', async () => {
    const pipeline = makePipeline({
      query: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const res = await ragRetrieve.handler({ query: 'hi' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Retrieval failed');
  });
});

describe('rag.vector_search', () => {
  it('queries with full vector weighting', async () => {
    const query = vi.fn().mockResolvedValue(sampleResults);
    const pipeline = makePipeline({ query });
    const res = await ragVectorSearch.handler({ query: 'hi', topK: 2 }, pipeline);
    expect(parseToolResult(res).count).toBe(2);
    expect(query.mock.calls[0][1]).toMatchObject({ vectorWeight: 1, bm25Weight: 0 });
  });

  it('validates input', async () => {
    const res = await ragVectorSearch.handler({}, makePipeline({ query: vi.fn() }));
    expect(res.isError).toBe(true);
  });

  it('handles pipeline errors', async () => {
    const pipeline = makePipeline({ query: vi.fn().mockRejectedValue(new Error('x')) });
    const res = await ragVectorSearch.handler({ query: 'hi' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Retrieval failed');
  });
});

describe('rag.bm25_search', () => {
  it('queries with full bm25 weighting', async () => {
    const query = vi.fn().mockResolvedValue([sampleResults[0]]);
    const pipeline = makePipeline({ query });
    const res = await ragBM25Search.handler({ query: 'hi' }, pipeline);
    expect(parseToolResult(res).count).toBe(1);
    expect(query.mock.calls[0][1]).toMatchObject({ vectorWeight: 0, bm25Weight: 1 });
  });

  it('validates input', async () => {
    const res = await ragBM25Search.handler({}, makePipeline({ query: vi.fn() }));
    expect(res.isError).toBe(true);
  });

  it('handles pipeline errors', async () => {
    const pipeline = makePipeline({ query: vi.fn().mockRejectedValue(new Error('x')) });
    const res = await ragBM25Search.handler({ query: 'hi' }, pipeline);
    expect(res.isError).toBe(true);
  });
});

describe('rag.rerank', () => {
  it('returns a not-implemented message with document count', async () => {
    const res = await ragRerank.handler({ query: 'hi', documents: ['a', 'b'] }, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.documentCount).toBe(2);
    expect(payload.message).toContain('not yet implemented');
  });

  it('validates empty documents array', async () => {
    const res = await ragRerank.handler({ query: 'hi', documents: [] }, makePipeline({}));
    expect(res.isError).toBe(true);
  });
});

import type { RetrievalResult } from '@reaatech/hybrid-rag';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RerankerEngine } from './reranker.js';

const { openAICreate } = vi.hoisted(() => ({ openAICreate: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openAICreate } };
  },
}));

function rr(chunkId: string, content: string): RetrievalResult {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    content,
    score: 1,
    source: 'vector',
    metadata: {},
  };
}

describe('RerankerEngine config', () => {
  it('applies default models per provider', () => {
    expect(new RerankerEngine({ provider: 'cohere' }).getConfig().model).toBe(
      'rerank-english-v3.0',
    );
    expect(new RerankerEngine({ provider: 'jina' }).getConfig().model).toBe(
      'jina-reranker-v2-base-multilingual',
    );
    expect(new RerankerEngine({ provider: 'openai' }).getConfig().model).toBe('gpt-4o');
    expect(new RerankerEngine({ provider: 'local' }).getConfig().model).toBe(
      'cross-encoder/ms-marco-MiniLM-L-6-v2',
    );
  });

  it('respects explicit config overrides', () => {
    const cfg = new RerankerEngine({
      provider: 'cohere',
      model: 'custom',
      apiKey: 'k',
      topK: 3,
      finalK: 2,
    }).getConfig();
    expect(cfg).toMatchObject({ model: 'custom', apiKey: 'k', topK: 3, finalK: 2 });
  });

  it('falls back to cohere default model for an unknown provider', () => {
    const cfg = new RerankerEngine({ provider: 'bogus' as never }).getConfig();
    expect(cfg.model).toBe('rerank-english-v3.0');
  });

  it('throws for an unknown provider at rerank time', async () => {
    const engine = new RerankerEngine({ provider: 'bogus' as never });
    await expect(engine.rerank('q', ['doc'])).rejects.toThrow('Unknown reranker provider: bogus');
  });
});

describe('RerankerEngine.rerank local', () => {
  it('returns [] for empty documents', async () => {
    const engine = new RerankerEngine({ provider: 'local' });
    expect(await engine.rerank('q', [])).toEqual([]);
  });

  it('scores by term overlap and sorts descending', async () => {
    const engine = new RerankerEngine({ provider: 'local' });
    const out = await engine.rerank('quick fox', ['the quick fox runs', 'totally unrelated text']);
    expect(out[0]!.content).toBe('the quick fox runs');
    expect(out[0]!.relevanceScore).toBeGreaterThanOrEqual(out[1]!.relevanceScore);
    expect(out[0]!.metadata).toEqual({ provider: 'local' });
  });

  it('handles query with no terms longer than 2 chars (score 0)', async () => {
    const engine = new RerankerEngine({ provider: 'local' });
    const out = await engine.rerank('a an', ['some content here']);
    expect(out[0]!.relevanceScore).toBe(0);
  });

  it('awards partial credit for substring matches', async () => {
    const engine = new RerankerEngine({ provider: 'local' });
    const out = await engine.rerank('learning', ['machine learnings everywhere']);
    expect(out[0]!.relevanceScore).toBeGreaterThan(0);
  });

  it('limits docs to topK before scoring', async () => {
    const engine = new RerankerEngine({ provider: 'local', topK: 1 });
    const out = await engine.rerank('foo', ['foo one', 'foo two', 'foo three']);
    expect(out).toHaveLength(1);
  });
});

describe('RerankerEngine.rerankResults', () => {
  it('returns [] for empty results', async () => {
    const engine = new RerankerEngine({ provider: 'local' });
    expect(await engine.rerankResults('q', [])).toEqual([]);
  });

  it('maps reranked docs back to original results with rank/score', async () => {
    const engine = new RerankerEngine({ provider: 'local', finalK: 2 });
    const results = [rr('a', 'quick fox here'), rr('b', 'unrelated'), rr('c', 'fox quick again')];
    const out = await engine.rerankResults('quick fox', results);
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out[0]).toHaveProperty('rerankScore');
    expect(out[0]).toHaveProperty('rerankRank', 1);
    expect(out[0]!.chunkId).toBeTypeOf('string');
  });

  it('drops reranked docs that no longer match any original content', async () => {
    const engine = new RerankerEngine({ provider: 'local', finalK: 5 });
    vi.spyOn(engine, 'rerank').mockResolvedValue([
      {
        chunkId: 'x',
        documentId: 'd',
        content: 'no original has this content',
        relevanceScore: 0.9,
        metadata: {},
      },
    ]);
    const out = await engine.rerankResults('q', [rr('a', 'real content')]);
    expect(out).toEqual([]);
  });
});

describe('RerankerEngine cohere/jina fetch', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('cohere without apiKey falls back to local', async () => {
    const engine = new RerankerEngine({ provider: 'cohere' });
    const out = await engine.rerank('quick', ['quick brown']);
    expect(out[0]!.metadata).toEqual({ provider: 'local' });
  });

  it('cohere success path parses API response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ index: 0, relevance_score: 0.9 }] }),
    }) as unknown as typeof fetch;
    const engine = new RerankerEngine({ provider: 'cohere', apiKey: 'k' });
    const out = await engine.rerank('q', ['doc text']);
    expect(out[0]!.relevanceScore).toBe(0.9);
    expect(out[0]!.metadata).toMatchObject({ provider: 'cohere' });
  });

  it('cohere non-ok response falls back to local', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    }) as unknown as typeof fetch;
    const engine = new RerankerEngine({ provider: 'cohere', apiKey: 'k' });
    const out = await engine.rerank('quick', ['quick brown']);
    expect(out[0]!.metadata).toEqual({ provider: 'local' });
  });

  it('jina without apiKey falls back to local', async () => {
    const engine = new RerankerEngine({ provider: 'jina' });
    const out = await engine.rerank('quick', ['quick brown']);
    expect(out[0]!.metadata).toEqual({ provider: 'local' });
  });

  it('jina success path uses document.text when present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ index: 0, relevance_score: 0.7, document: { text: 'returned text' } }],
      }),
    }) as unknown as typeof fetch;
    const engine = new RerankerEngine({ provider: 'jina', apiKey: 'k' });
    const out = await engine.rerank('q', ['orig doc']);
    expect(out[0]!.content).toBe('returned text');
    expect(out[0]!.relevanceScore).toBe(0.7);
  });

  it('jina falls back to source doc when document.text missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ index: 0, relevance_score: 0.5 }] }),
    }) as unknown as typeof fetch;
    const engine = new RerankerEngine({ provider: 'jina', apiKey: 'k' });
    const out = await engine.rerank('q', ['orig doc']);
    expect(out[0]!.content).toBe('orig doc');
  });

  it('jina non-ok response falls back to local', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }) as unknown as typeof fetch;
    const engine = new RerankerEngine({ provider: 'jina', apiKey: 'k' });
    const out = await engine.rerank('quick', ['quick brown']);
    expect(out[0]!.metadata).toEqual({ provider: 'local' });
  });
});

describe('RerankerEngine openai', () => {
  beforeEach(() => {
    openAICreate.mockReset();
  });

  it('without apiKey falls back to local', async () => {
    const engine = new RerankerEngine({ provider: 'openai' });
    const out = await engine.rerank('quick', ['quick brown']);
    expect(out[0]!.metadata).toEqual({ provider: 'local' });
  });

  it('parses LLM JSON scores and sorts/clamps them', async () => {
    openAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '```json\n[{"index":0,"score":2.0},{"index":1,"score":-0.5}]\n```',
          },
        },
      ],
    });
    const engine = new RerankerEngine({ provider: 'openai', apiKey: 'k', finalK: 5 });
    const out = await engine.rerank('q', ['doc zero', 'doc one']);
    expect(out[0]!.relevanceScore).toBe(1); // clamped from 2.0
    expect(out[1]!.relevanceScore).toBe(0); // clamped from -0.5
    expect(out[0]!.metadata).toMatchObject({ provider: 'openai' });
  });

  it('handles missing choice content (defaults to empty array)', async () => {
    openAICreate.mockResolvedValue({ choices: [{ message: {} }] });
    const engine = new RerankerEngine({ provider: 'openai', apiKey: 'k' });
    const out = await engine.rerank('q', ['doc']);
    expect(out).toEqual([]);
  });

  it('batches documents over batchSize of 10', async () => {
    openAICreate.mockImplementation(({ messages }: { messages: { content: string }[] }) => {
      const userContent = messages[1]!.content;
      const indices = [...userContent.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify(indices.map((i) => ({ index: i, score: 0.5 }))),
            },
          },
        ],
      });
    });
    const engine = new RerankerEngine({ provider: 'openai', apiKey: 'k', topK: 25, finalK: 25 });
    const docs = Array.from({ length: 15 }, (_, i) => `doc ${i}`);
    const out = await engine.rerank('q', docs);
    expect(openAICreate).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(15);
  });

  it('falls back to local when OpenAI call throws', async () => {
    openAICreate.mockRejectedValue(new Error('boom'));
    const engine = new RerankerEngine({ provider: 'openai', apiKey: 'k' });
    const out = await engine.rerank('quick', ['quick brown']);
    expect(out[0]!.metadata).toEqual({ provider: 'local' });
  });
});

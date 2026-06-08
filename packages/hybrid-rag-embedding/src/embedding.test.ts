import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingService } from './embedding.js';
import * as indexExports from './index.js';

const createMock = vi.fn();

vi.mock('openai', () => ({
  OpenAI: vi.fn(function OpenAI(this: Record<string, unknown>, opts: { apiKey?: string }) {
    this.__opts = opts;
    this.embeddings = { create: createMock };
  }),
}));

beforeEach(() => {
  createMock.mockReset();
});

describe('EmbeddingService.embed', () => {
  it('embeds a single text via OpenAI provider', async () => {
    createMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 10 },
    });
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'test-key',
    });
    const result = await service.embed('hello world');
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.tokens).toBe(10);
    expect(result.cost).toBeCloseTo(10 * (0.02 / 1_000_000), 12);
    expect(createMock).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'hello world',
    });
  });

  it('reuses the same OpenAI client across calls', async () => {
    const { OpenAI } = await import('openai');
    (OpenAI as unknown as { mockClear: () => void }).mockClear();
    createMock.mockResolvedValue({
      data: [{ embedding: [1] }],
      usage: { prompt_tokens: 1 },
    });
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'text-embedding-3-small',
    });
    await service.embed('a');
    await service.embed('b');
    expect(OpenAI).toHaveBeenCalledTimes(1);
  });

  it('handles missing embedding / usage data with defaults', async () => {
    createMock.mockResolvedValue({ data: [], usage: undefined });
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'text-embedding-3-small',
    });
    const result = await service.embed('x');
    expect(result.embedding).toEqual([]);
    expect(result.tokens).toBe(0);
    expect(result.cost).toBe(0);
  });

  it('uses large model pricing', async () => {
    createMock.mockResolvedValue({
      data: [{ embedding: [0.5] }],
      usage: { prompt_tokens: 100 },
    });
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'text-embedding-3-large',
    });
    const result = await service.embed('big');
    expect(result.cost).toBeCloseTo(100 * (0.13 / 1_000_000), 12);
  });

  it('returns zero cost for unknown model', async () => {
    createMock.mockResolvedValue({
      data: [{ embedding: [0.5] }],
      usage: { prompt_tokens: 100 },
    });
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'mystery-model',
    });
    const result = await service.embed('q');
    expect(result.cost).toBe(0);
  });

  it('throws for the vertex provider (not implemented)', async () => {
    const service = new EmbeddingService({ provider: 'vertex', model: 'm' });
    await expect(service.embed('x')).rejects.toThrow('Vertex AI embedding not yet implemented');
  });

  it('throws for the local provider (not implemented)', async () => {
    const service = new EmbeddingService({ provider: 'local', model: 'm' });
    await expect(service.embed('x')).rejects.toThrow('Local embedding not yet implemented');
  });

  it('throws for an unknown provider', async () => {
    const service = new EmbeddingService({
      provider: 'bogus' as never,
      model: 'm',
    });
    await expect(service.embed('x')).rejects.toThrow('Unknown provider: bogus');
  });

  it('propagates OpenAI client errors', async () => {
    createMock.mockRejectedValue(new Error('rate limited'));
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'text-embedding-3-small',
    });
    await expect(service.embed('x')).rejects.toThrow('rate limited');
  });
});

describe('EmbeddingService.embedBatch', () => {
  it('embeds a batch via the OpenAI batch path', async () => {
    createMock.mockResolvedValue({
      data: [{ embedding: [1] }, { embedding: [2] }],
      usage: { prompt_tokens: 8 },
    });
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'text-embedding-3-small',
    });
    const results = await service.embedBatch(['a', 'b']);
    expect(results).toHaveLength(2);
    expect(results[0]?.embedding).toEqual([1]);
    expect(results[1]?.embedding).toEqual([2]);
    // 8 tokens / 2 items = 4 tokens each
    expect(results[0]?.tokens).toBe(4);
    expect(createMock).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['a', 'b'],
    });
  });

  it('splits work according to batchSize', async () => {
    createMock.mockResolvedValue({
      data: [{ embedding: [1] }],
      usage: { prompt_tokens: 2 },
    });
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'text-embedding-3-small',
      batchSize: 1,
    });
    const results = await service.embedBatch(['a', 'b', 'c']);
    expect(results).toHaveLength(3);
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('returns empty array for empty input', async () => {
    const service = new EmbeddingService({
      provider: 'openai',
      model: 'text-embedding-3-small',
    });
    const results = await service.embedBatch([]);
    expect(results).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('applies rate limiting delay between batches', async () => {
    vi.useFakeTimers();
    try {
      createMock.mockResolvedValue({
        data: [{ embedding: [1] }],
        usage: { prompt_tokens: 2 },
      });
      const service = new EmbeddingService({
        provider: 'openai',
        model: 'text-embedding-3-small',
        batchSize: 1,
        rateLimit: 60,
      });
      const promise = service.embedBatch(['a', 'b']);
      await vi.runAllTimersAsync();
      const results = await promise;
      expect(results).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the per-item embed path for non-openai providers in batch', async () => {
    const service = new EmbeddingService({ provider: 'local', model: 'm' });
    await expect(service.embedBatch(['a'])).rejects.toThrow('Local embedding not yet implemented');
  });
});

describe('EmbeddingService.getDimension', () => {
  it('returns known dimensions', () => {
    expect(EmbeddingService.getDimension('text-embedding-3-small')).toBe(1536);
    expect(EmbeddingService.getDimension('text-embedding-3-large')).toBe(3072);
  });

  it('falls back to 1536 for unknown models', () => {
    expect(EmbeddingService.getDimension('unknown')).toBe(1536);
  });
});

describe('index exports', () => {
  it('re-exports EmbeddingService', () => {
    expect(indexExports.EmbeddingService).toBe(EmbeddingService);
  });
});

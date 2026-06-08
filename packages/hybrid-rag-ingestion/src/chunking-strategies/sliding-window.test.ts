import type { ChunkingConfig } from '@reaatech/hybrid-rag';
import { ChunkingStrategy } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import { SlidingWindowChunker } from './sliding-window.js';

const cfg = (overrides: Partial<ChunkingConfig> = {}): ChunkingConfig => ({
  strategy: ChunkingStrategy.SLIDING_WINDOW,
  chunkSize: 256,
  overlap: 128,
  ...overrides,
});

describe('SlidingWindowChunker', () => {
  it('throws when stride is not positive', () => {
    expect(() => new SlidingWindowChunker({ stride: 0 })).toThrow(/Stride/);
  });

  it('returns empty array for empty content', () => {
    const chunker = new SlidingWindowChunker();
    expect(chunker.chunk('', 'd', cfg())).toEqual([]);
  });

  it('creates overlapping windows', () => {
    const chunker = new SlidingWindowChunker({ windowSize: 30, stride: 15 });
    const content = 'word '.repeat(40).trim();
    const chunks = chunker.chunk(content, 'doc', cfg({ windowSize: 30, stride: 15 }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.documentId).toBe('doc');
    expect(chunks[0]?.strategy).toBe(ChunkingStrategy.SLIDING_WINDOW);
    expect(chunks[0]?.tokenCount).toBeGreaterThan(0);
  });

  it('breaks at natural boundary when not at end', () => {
    const chunker = new SlidingWindowChunker();
    const content = `${'a'.repeat(20)} ${'b'.repeat(60)}`;
    const chunks = chunker.chunk(content, 'd', cfg({ windowSize: 30, stride: 25 }));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('uses config window and stride overrides', () => {
    const chunker = new SlidingWindowChunker({ windowSize: 256, stride: 128 });
    const content = 'x'.repeat(100);
    const chunks = chunker.chunk(content, 'd', cfg({ windowSize: 25, stride: 25 }));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('includes seed in chunk id', () => {
    const chunker = new SlidingWindowChunker({ windowSize: 50, stride: 25 });
    const chunks = chunker.chunk(
      'hello world content',
      'd',
      cfg({ windowSize: 50, stride: 25, seed: 9 }),
    );
    expect(chunks[0]?.id).toBe('chunk-d-0-9');
  });

  it('skips windows that trim to empty', () => {
    const chunker = new SlidingWindowChunker({ windowSize: 10, stride: 5 });
    const content = `start${'     '.repeat(10)}end`;
    const chunks = chunker.chunk(content, 'd', cfg({ windowSize: 10, stride: 5 }));
    expect(chunks.every((c) => c.content.length > 0)).toBe(true);
  });
});

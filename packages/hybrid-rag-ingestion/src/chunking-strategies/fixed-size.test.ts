import type { ChunkingConfig } from '@reaatech/hybrid-rag';
import { ChunkingStrategy } from '@reaatech/hybrid-rag';
import { afterEach, describe, expect, it } from 'vitest';
import { FixedSizeChunker } from './fixed-size.js';

const baseConfig = (overrides: Partial<ChunkingConfig> = {}): ChunkingConfig => ({
  strategy: ChunkingStrategy.FIXED_SIZE,
  chunkSize: 20,
  overlap: 5,
  ...overrides,
});

describe('FixedSizeChunker', () => {
  const disposables: FixedSizeChunker[] = [];

  afterEach(() => {
    for (const d of disposables.splice(0)) {
      d.dispose();
    }
  });

  it('throws when overlap >= chunkSize at construction', () => {
    expect(() => new FixedSizeChunker({ chunkSize: 10, overlap: 10 })).toThrow(/Overlap/);
  });

  it('chunks by character mode and sets positions', () => {
    const chunker = new FixedSizeChunker({ mode: 'character' });
    const content = 'a'.repeat(50);
    const chunks = chunker.chunk(content, 'doc1', baseConfig({ chunkSize: 20, overlap: 5 }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.id).toBe('chunk-doc1-0');
    expect(chunks[0]?.documentId).toBe('doc1');
    expect(chunks[0]?.strategy).toBe(ChunkingStrategy.FIXED_SIZE);
    expect(chunks[0]?.characterCount).toBe(chunks[0]?.content.length);
    expect(chunks[0]?.tokenCount).toBe(chunks[0]?.content.length);
  });

  it('breaks on sentence boundary in character mode', () => {
    const chunker = new FixedSizeChunker({ mode: 'character' });
    const content = `${'x'.repeat(15)}. ${'y'.repeat(40)}`;
    const chunks = chunker.chunk(content, 'd', baseConfig({ chunkSize: 25, overlap: 5 }));
    expect(chunks[0]?.content.endsWith('.')).toBe(true);
  });

  it('includes seed in chunk id when provided', () => {
    const chunker = new FixedSizeChunker({ mode: 'character' });
    const chunks = chunker.chunk(
      'hello world here',
      'd',
      baseConfig({ chunkSize: 100, overlap: 0, seed: 42 }),
    );
    expect(chunks[0]?.id).toBe('chunk-d-0-42');
  });

  it('chunks by word mode', () => {
    const chunker = new FixedSizeChunker({ mode: 'word' });
    const content = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunker.chunk(content, 'd', baseConfig({ chunkSize: 10, overlap: 2 }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.tokenCount).toBe(10);
  });

  it('chunks by token mode using tiktoken', () => {
    const chunker = new FixedSizeChunker({ mode: 'token' });
    disposables.push(chunker);
    const content = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
    const chunks = chunker.chunk(content, 'd', baseConfig({ chunkSize: 16, overlap: 4 }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.tokenCount).toBeGreaterThan(0);
  });

  it('falls back to instance chunkSize when config chunkSize is falsy', () => {
    const chunker = new FixedSizeChunker({ mode: 'character', chunkSize: 30, overlap: 5 });
    const content = 'z'.repeat(80);
    const chunks = chunker.chunk(content, 'd', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 0,
      overlap: 5,
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('handles content shorter than chunk size', () => {
    const chunker = new FixedSizeChunker({ mode: 'character' });
    const chunks = chunker.chunk('short', 'd', baseConfig({ chunkSize: 100, overlap: 0 }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe('short');
  });

  it('dispose is idempotent', () => {
    const chunker = new FixedSizeChunker({ mode: 'token' });
    chunker.chunk('hello world', 'd', baseConfig({ chunkSize: 100, overlap: 0 }));
    chunker.dispose();
    expect(() => chunker.dispose()).not.toThrow();
  });
});

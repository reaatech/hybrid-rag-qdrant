import type { ChunkingConfig, Document } from '@reaatech/hybrid-rag';
import { ChunkingStrategy } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import { ChunkingEngine, chunkDocument } from './chunking-engine.js';

const content = 'The quick brown fox jumps over the lazy dog. '.repeat(20);

describe('ChunkingEngine.chunk', () => {
  it('dispatches to fixed-size strategy and returns stats', () => {
    const engine = new ChunkingEngine();
    const config: ChunkingConfig = {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 32,
      overlap: 4,
    };
    const result = engine.chunk(content, 'd', config);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.stats.totalChunks).toBe(result.chunks.length);
    expect(result.stats.avgChunkSize).toBeGreaterThan(0);
    expect(result.stats.minChunkSize).toBeLessThanOrEqual(result.stats.maxChunkSize);
    expect(result.stats.totalTokens).toBeGreaterThan(0);
    expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('dispatches to semantic strategy', () => {
    const engine = new ChunkingEngine();
    const result = engine.chunk(content, 'd', {
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 512,
      overlap: 0,
    });
    expect(result.stats.totalChunks).toBe(result.chunks.length);
  });

  it('dispatches to recursive strategy', () => {
    const engine = new ChunkingEngine();
    const result = engine.chunk(content, 'd', {
      strategy: ChunkingStrategy.RECURSIVE,
      chunkSize: 64,
      overlap: 8,
    });
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('dispatches to sliding window strategy', () => {
    const engine = new ChunkingEngine();
    const result = engine.chunk(content, 'd', {
      strategy: ChunkingStrategy.SLIDING_WINDOW,
      chunkSize: 64,
      overlap: 32,
      windowSize: 64,
      stride: 32,
    });
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('throws for unknown strategy', () => {
    const engine = new ChunkingEngine();
    expect(() =>
      engine.chunk(content, 'd', {
        strategy: 'nope' as ChunkingStrategy,
        chunkSize: 10,
        overlap: 0,
      }),
    ).toThrow(/Unknown chunking strategy/);
  });

  it('returns zeroed stats for empty chunk output', () => {
    const engine = new ChunkingEngine();
    const result = engine.chunk('', 'd', {
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 512,
      overlap: 0,
    });
    expect(result.stats.totalChunks).toBe(0);
    expect(result.stats.avgChunkSize).toBe(0);
    expect(result.stats.minChunkSize).toBe(0);
    expect(result.stats.maxChunkSize).toBe(0);
    expect(result.stats.totalTokens).toBe(0);
  });
});

describe('ChunkingEngine.chunkBatch', () => {
  it('chunks multiple documents', () => {
    const engine = new ChunkingEngine();
    const docs: Document[] = [
      { id: 'a', content, source: 'a.txt' },
      { id: 'b', content, source: 'b.txt' },
    ] as unknown as Document[];
    const results = engine.chunkBatch(docs, {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 32,
      overlap: 4,
    });
    expect(results).toHaveLength(2);
  });
});

describe('ChunkingEngine.validateConfig', () => {
  it('returns no errors for a valid config', () => {
    expect(
      ChunkingEngine.validateConfig({
        strategy: ChunkingStrategy.FIXED_SIZE,
        chunkSize: 100,
        overlap: 10,
      }),
    ).toEqual([]);
  });

  it('flags invalid strategy, sizes, overlaps, stride and threshold', () => {
    const errors = ChunkingEngine.validateConfig({
      strategy: 'bogus' as ChunkingStrategy,
      chunkSize: 0,
      overlap: -1,
      stride: 0,
      similarityThreshold: 2,
    });
    expect(errors).toContain('Invalid chunking strategy: bogus');
    expect(errors).toContain('Chunk size must be positive');
    expect(errors).toContain('Overlap must be non-negative');
    expect(errors).toContain('Stride must be positive');
    expect(errors).toContain('Similarity threshold must be between 0 and 1');
  });

  it('flags overlap >= chunkSize', () => {
    const errors = ChunkingEngine.validateConfig({
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 10,
      overlap: 10,
    });
    expect(errors).toContain('Overlap must be less than chunk size');
  });

  it('accepts a valid in-range similarity threshold', () => {
    const errors = ChunkingEngine.validateConfig({
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 100,
      overlap: 0,
      similarityThreshold: 0.5,
    });
    expect(errors).toEqual([]);
  });
});

describe('ChunkingEngine.getDefaultConfig', () => {
  it('returns defaults for each strategy', () => {
    expect(ChunkingEngine.getDefaultConfig(ChunkingStrategy.FIXED_SIZE).chunkSize).toBe(512);
    expect(ChunkingEngine.getDefaultConfig(ChunkingStrategy.SEMANTIC).similarityThreshold).toBe(
      0.5,
    );
    expect(ChunkingEngine.getDefaultConfig(ChunkingStrategy.RECURSIVE).separators).toBeDefined();
    expect(ChunkingEngine.getDefaultConfig(ChunkingStrategy.SLIDING_WINDOW).stride).toBe(128);
  });
});

describe('chunkDocument', () => {
  it('returns chunks for a document', async () => {
    const chunks = await chunkDocument(content, 'd', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 32,
      overlap: 4,
    });
    expect(chunks.length).toBeGreaterThan(0);
  });
});

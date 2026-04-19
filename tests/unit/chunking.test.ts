/**
 * Unit tests for chunking strategies
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FixedSizeChunker } from '../../src/chunking/strategies/fixed-size.js';
import { SemanticChunker } from '../../src/chunking/strategies/semantic.js';
import { RecursiveChunker } from '../../src/chunking/strategies/recursive.js';
import { SlidingWindowChunker } from '../../src/chunking/strategies/sliding-window.js';
import { ChunkingEngine } from '../../src/chunking/engine.js';
import { ChunkingStrategy } from '../../src/types/domain.js';

describe('FixedSizeChunker', () => {
  let chunker: FixedSizeChunker;

  beforeEach(() => {
    chunker = new FixedSizeChunker({ chunkSize: 100, overlap: 10, mode: 'character' });
  });

  it('should chunk text by character count', () => {
    const content = 'A'.repeat(250);
    const chunks = chunker.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 100,
      overlap: 10,
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content.length).toBeLessThanOrEqual(100);
  });

  it('should preserve document id in chunks', () => {
    const content = 'Test content here with enough words to chunk properly';
    const chunks = chunker.chunk(content, 'my-doc-id', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 50,
      overlap: 5,
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.documentId).toBe('my-doc-id');
  });

  it('should generate deterministic chunk IDs', () => {
    const content = 'Test content';
    const chunks1 = chunker.chunk(content, 'doc', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 50,
      seed: 42,
      overlap: 0,
    });
    const chunks2 = chunker.chunk(content, 'doc', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 50,
      seed: 42,
      overlap: 0,
    });

    expect(chunks1[0]?.id).toBe(chunks2[0]?.id);
  });

  it('should handle empty content', () => {
    const chunks = chunker.chunk('', 'test-doc', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 100,
      overlap: 0,
    });

    expect(chunks.length).toBe(0);
  });

  it('should use character mode', () => {
    const chunker = new FixedSizeChunker({ mode: 'character', chunkSize: 50 });
    const content = 'This is a longer piece of text that should be split';
    const chunks = chunker.chunk(content, 'test', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 50,
      overlap: 0,
    });

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should dispose encoder resources', () => {
    const chunker = new FixedSizeChunker({ mode: 'token', chunkSize: 100 });
    chunker.dispose();
    // Should not throw
    expect(true).toBe(true);
  });
});

describe('SemanticChunker', () => {
  let chunker: SemanticChunker;

  beforeEach(() => {
    chunker = new SemanticChunker({ minChunkSize: 20, maxChunkSize: 2000 });
  });

  it('should chunk by sentence boundaries', () => {
    const content = 'This is sentence one. This is sentence two. This is sentence three.';
    const chunks = chunker.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 200,
      overlap: 0,
    });

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should respect similarity threshold', () => {
    const content = 'Topic A content here. More about topic A. Now topic B content. More about topic B.';
    const chunks = chunker.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 200,
      overlap: 0,
      similarityThreshold: 0.3,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle content without sentence boundaries', () => {
    const content = 'This is a very long piece of text without any punctuation marks to split on';
    const chunks = chunker.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 500,
      overlap: 0,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should assign correct indices to chunks', () => {
    const content = 'First sentence. Second sentence. Third sentence.';
    const chunks = chunker.chunk(content, 'test', {
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 200,
      overlap: 0,
    });

    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });
});

describe('RecursiveChunker', () => {
  let chunker: RecursiveChunker;

  beforeEach(() => {
    chunker = new RecursiveChunker({ separators: ['\n', '. ', ' '] });
  });

  it('should split by headers first', () => {
    const content = '# Header 1\nContent for header 1.\n\n## Header 2\nContent for header 2.';
    const chunks = chunker.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.RECURSIVE,
      chunkSize: 100,
      overlap: 10,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should use custom separators', () => {
    const content = 'Section 1|Paragraph 1|Sentence 1.';
    const chunks = chunker.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.RECURSIVE,
      chunkSize: 100,
      overlap: 0,
      separators: ['|', '.', ' '],
    });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle short content', () => {
    const content = 'Short';
    const chunks = chunker.chunk(content, 'test', {
      strategy: ChunkingStrategy.RECURSIVE,
      chunkSize: 100,
      overlap: 0,
    });

    expect(chunks.length).toBe(1);
  });
});

describe('SlidingWindowChunker', () => {
  let chunker: SlidingWindowChunker;

  beforeEach(() => {
    chunker = new SlidingWindowChunker({ windowSize: 50, stride: 25 });
  });

  it('should create overlapping chunks', () => {
    const content = 'A'.repeat(150);
    const chunks = chunker.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.SLIDING_WINDOW,
      chunkSize: 256,
      windowSize: 50,
      stride: 25,
      overlap: 25,
    });

    expect(chunks.length).toBeGreaterThan(2);
  });

  it('should handle stride equal to window size (no overlap)', () => {
    const chunker = new SlidingWindowChunker({ windowSize: 50, stride: 50 });
    const content = 'A'.repeat(100);
    const chunks = chunker.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.SLIDING_WINDOW,
      chunkSize: 256,
      windowSize: 50,
      stride: 50,
      overlap: 0,
    });

    expect(chunks.length).toBe(2);
  });

  it('should handle empty content', () => {
    const chunks = chunker.chunk('', 'test', {
      strategy: ChunkingStrategy.SLIDING_WINDOW,
      chunkSize: 256,
      windowSize: 50,
      stride: 25,
      overlap: 0,
    });

    expect(chunks.length).toBe(0);
  });

  it('should generate sequential indices', () => {
    const content = 'This is a test string that will be chunked';
    const chunks = chunker.chunk(content, 'test', {
      strategy: ChunkingStrategy.SLIDING_WINDOW,
      chunkSize: 256,
      windowSize: 20,
      stride: 10,
      overlap: 10,
    });

    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });
});

describe('ChunkingEngine', () => {
  let engine: ChunkingEngine;

  beforeEach(() => {
    engine = new ChunkingEngine();
  });

  it('should chunk using fixed-size strategy', () => {
    const content = 'Test content for chunking engine that should be split into multiple chunks';
    const result = engine.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 50,
      overlap: 5,
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.stats.totalChunks).toBe(result.chunks.length);
  });

  it('should chunk using semantic strategy', () => {
    const content = 'First sentence. Second sentence. Third sentence.';
    const result = engine.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 200,
      overlap: 0,
    });

    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('should chunk using recursive strategy', () => {
    const content = '# Header\nContent here.\n\n## Subheader\nMore content.';
    const result = engine.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.RECURSIVE,
      chunkSize: 100,
      overlap: 10,
    });

    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('should throw on unknown strategy', () => {
    expect(() => {
      engine.chunk('test', 'doc', {
        strategy: 'unknown' as ChunkingStrategy,
        chunkSize: 100,
        overlap: 0,
      });
    }).toThrow();
  });

  it('should batch process documents', () => {
    const documents = [
      {
        id: 'doc-1',
        content: 'Content one with enough words to be chunked properly',
        source: 'test',
        metadata: {},
      },
      {
        id: 'doc-2',
        content: 'Content two with enough words to be chunked properly',
        source: 'test',
        metadata: {},
      },
    ];

    const results = engine.chunkBatch(documents, {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 50,
      overlap: 5,
    });

    expect(results.length).toBe(2);
    expect(results[0].chunks.length).toBeGreaterThan(0);
    expect(results[1].chunks.length).toBeGreaterThan(0);
  });

  it('should calculate stats correctly', () => {
    const content = 'A'.repeat(200);
    const result = engine.chunk(content, 'test-doc', {
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 100,
      overlap: 0,
    });

    expect(result.stats.totalChunks).toBe(result.chunks.length);
    expect(result.stats.avgChunkSize).toBeGreaterThan(0);
    expect(result.stats.minChunkSize).toBeGreaterThan(0);
    expect(result.stats.maxChunkSize).toBeGreaterThan(0);
  });

  it('should validate config', () => {
    const errors = ChunkingEngine.validateConfig({
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 512,
      overlap: 50,
    });

    expect(errors).toHaveLength(0);
  });

  it('should reject invalid config - overlap >= chunkSize', () => {
    const errors = ChunkingEngine.validateConfig({
      strategy: ChunkingStrategy.FIXED_SIZE,
      chunkSize: 100,
      overlap: 100,
    });

    expect(errors).toContain('Overlap must be less than chunk size');
  });

  it('should reject invalid similarity threshold', () => {
    const errors = ChunkingEngine.validateConfig({
      strategy: ChunkingStrategy.SEMANTIC,
      chunkSize: 512,
      overlap: 0,
      similarityThreshold: 1.5,
    });

    expect(errors).toContain('Similarity threshold must be between 0 and 1');
  });

  it('should get default config for each strategy', () => {
    const fixedConfig = ChunkingEngine.getDefaultConfig(ChunkingStrategy.FIXED_SIZE);
    expect(fixedConfig.strategy).toBe(ChunkingStrategy.FIXED_SIZE);
    expect(fixedConfig.chunkSize).toBe(512);

    const semanticConfig = ChunkingEngine.getDefaultConfig(ChunkingStrategy.SEMANTIC);
    expect(semanticConfig.strategy).toBe(ChunkingStrategy.SEMANTIC);
    expect(semanticConfig.similarityThreshold).toBe(0.5);

    const recursiveConfig = ChunkingEngine.getDefaultConfig(ChunkingStrategy.RECURSIVE);
    expect(recursiveConfig.strategy).toBe(ChunkingStrategy.RECURSIVE);

    const slidingConfig = ChunkingEngine.getDefaultConfig(ChunkingStrategy.SLIDING_WINDOW);
    expect(slidingConfig.strategy).toBe(ChunkingStrategy.SLIDING_WINDOW);
  });
});
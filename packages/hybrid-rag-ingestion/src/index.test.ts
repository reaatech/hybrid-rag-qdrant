import { describe, expect, it } from 'vitest';
import * as api from './index.js';

describe('package exports', () => {
  it('exposes the public API surface', () => {
    expect(typeof api.ChunkingEngine).toBe('function');
    expect(typeof api.ChunkingBenchmark).toBe('function');
    expect(typeof api.chunkDocument).toBe('function');
    expect(typeof api.FixedSizeChunker).toBe('function');
    expect(typeof api.RecursiveChunker).toBe('function');
    expect(typeof api.SemanticChunker).toBe('function');
    expect(typeof api.SlidingWindowChunker).toBe('function');
    expect(typeof api.DocumentLoader).toBe('function');
    expect(typeof api.TextPreprocessor).toBe('function');
    expect(typeof api.DocumentValidator).toBe('function');
    expect(typeof api.UnsupportedFormatError).toBe('function');
    expect(typeof api.FileSizeExceededError).toBe('function');
    expect(typeof api.DocumentParseError).toBe('function');
  });
});

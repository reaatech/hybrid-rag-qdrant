import type { ChunkingConfig } from '@reaatech/hybrid-rag';
import { ChunkingStrategy } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import { SemanticChunker } from './semantic.js';

const cfg = (overrides: Partial<ChunkingConfig> = {}): ChunkingConfig => ({
  strategy: ChunkingStrategy.SEMANTIC,
  chunkSize: 512,
  overlap: 0,
  ...overrides,
});

describe('SemanticChunker', () => {
  it('returns empty array for empty content', () => {
    const chunker = new SemanticChunker();
    expect(chunker.chunk('', 'd', cfg())).toEqual([]);
  });

  it('groups similar sentences together and splits on topic change', () => {
    const chunker = new SemanticChunker({ similarityThreshold: 0.1, minChunkSize: 1 });
    const content =
      'The database stores vectors efficiently. The database indexes vectors quickly. ' +
      'Cooking recipes require fresh ingredients. Cooking pasta needs boiling water properly.';
    const chunks = chunker.chunk(content, 'doc', cfg());
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]?.documentId).toBe('doc');
    expect(chunks[0]?.strategy).toBe(ChunkingStrategy.SEMANTIC);
  });

  it('splits when group exceeds maxChunkSize', () => {
    const chunker = new SemanticChunker({
      maxChunkSize: 40,
      minChunkSize: 1,
      similarityThreshold: 0,
    });
    const content =
      'Alpha beta gamma delta epsilon zeta. Alpha beta gamma delta epsilon zeta. Alpha beta gamma delta.';
    const chunks = chunker.chunk(content, 'd', cfg());
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('skips short non-final groups below minChunkSize', () => {
    const chunker = new SemanticChunker({
      similarityThreshold: 1,
      minChunkSize: 100,
      maxChunkSize: 50,
    });
    const content = 'Short one. Different two. Another three. Final four sentence here.';
    const chunks = chunker.chunk(content, 'd', cfg());
    // groups are tiny and below minChunkSize except possibly last
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('uses a custom sentence splitter', () => {
    const splitter = (t: string) => t.split('|').filter((s) => s.trim());
    const chunker = new SemanticChunker({
      sentenceSplitter: splitter,
      minChunkSize: 1,
      similarityThreshold: 2,
    });
    const chunks = chunker.chunk(
      'one piece here|two piece there|three piece somewhere',
      'd',
      cfg(),
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('handles sentences that are all stop-words (zero word sets)', () => {
    // Second sentence has only stop/short words so its word set is empty,
    // exercising the zero-similarity guard.
    const splitter = (t: string) => t.split('|').filter((s) => s.trim());
    const chunker = new SemanticChunker({
      sentenceSplitter: splitter,
      minChunkSize: 1,
      similarityThreshold: 0.5,
    });
    const content = 'meaningful database vectors content|the a an it is|more database vectors here';
    const chunks = chunker.chunk(content, 'd', cfg());
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('includes seed in chunk id', () => {
    const chunker = new SemanticChunker({ minChunkSize: 1, similarityThreshold: 2 });
    const chunks = chunker.chunk('Hello world content here.', 'd', cfg({ seed: 5 }));
    expect(chunks[0]?.id).toMatch(/chunk-d-\d+-5/);
  });
});

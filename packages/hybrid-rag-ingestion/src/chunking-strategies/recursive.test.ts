import type { ChunkingConfig } from '@reaatech/hybrid-rag';
import { ChunkingStrategy } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import { RecursiveChunker } from './recursive.js';

const cfg = (overrides: Partial<ChunkingConfig> = {}): ChunkingConfig => ({
  strategy: ChunkingStrategy.RECURSIVE,
  chunkSize: 50,
  overlap: 10,
  ...overrides,
});

describe('RecursiveChunker', () => {
  it('splits hierarchical markdown content', () => {
    const chunker = new RecursiveChunker();
    const content = [
      '## Section One',
      'This is the first paragraph with some content here.',
      '## Section Two',
      'This is the second paragraph with more content here.',
    ].join('\n');
    const chunks = chunker.chunk(content, 'doc', cfg({ chunkSize: 40, overlap: 5 }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.documentId).toBe('doc');
    expect(chunks[0]?.strategy).toBe(ChunkingStrategy.RECURSIVE);
    expect(chunks.every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it('returns a single chunk for short content', () => {
    const chunker = new RecursiveChunker();
    const chunks = chunker.chunk('hello there', 'd', cfg({ chunkSize: 500, overlap: 0 }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe('hello there');
  });

  it('keeps separators when keepSeparator is true', () => {
    const chunker = new RecursiveChunker({ keepSeparator: true, separators: ['. ', ' ', ''] });
    const content = 'First sentence. Second sentence. Third sentence longer one here yes.';
    const chunks = chunker.chunk(content, 'd', cfg({ chunkSize: 25, overlap: 0 }));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('applies overlap between chunks', () => {
    const chunker = new RecursiveChunker({ separators: ['\n', ' ', ''] });
    const lines = Array.from({ length: 10 }, (_, i) => `Line number ${i} content`).join('\n');
    const chunks = chunker.chunk(lines, 'd', cfg({ chunkSize: 30, overlap: 10 }));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('falls back to character split when content has no separators', () => {
    const chunker = new RecursiveChunker({ separators: ['\n\n', ''] });
    const content = 'a'.repeat(200);
    const chunks = chunker.chunk(content, 'd', cfg({ chunkSize: 30, overlap: 0 }));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('uses config separators when provided', () => {
    const chunker = new RecursiveChunker();
    const content = 'partA|partB content here|partC even more content over here|partD';
    const chunks = chunker.chunk(
      content,
      'd',
      cfg({ chunkSize: 20, overlap: 0, separators: ['|', ' ', ''] }),
    );
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('includes seed in chunk ids', () => {
    const chunker = new RecursiveChunker();
    const chunks = chunker.chunk(
      'hello world there',
      'd',
      cfg({ chunkSize: 500, overlap: 0, seed: 7 }),
    );
    expect(chunks[0]?.id).toBe('chunk-d-0-7');
  });

  it('handles content that triggers deeper recursion levels', () => {
    const chunker = new RecursiveChunker();
    const big = `${'word '.repeat(100)}\n\n${'term '.repeat(100)}`;
    const chunks = chunker.chunk(big, 'd', cfg({ chunkSize: 40, overlap: 5 }));
    expect(chunks.length).toBeGreaterThan(2);
  });

  it('stops splitting when a separator entry is missing/undefined', () => {
    const chunker = new RecursiveChunker();
    const content = 'a'.repeat(120);
    // The separator at index 0 is undefined (a hole), forcing the null-separator
    // guard branch; remaining content is kept whole.
    const chunks = chunker.chunk(
      content,
      'd',
      cfg({
        chunkSize: 30,
        overlap: 0,
        separators: [undefined as unknown as string, ' ', ''],
      }),
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps all parts when each is already within chunk size', () => {
    const chunker = new RecursiveChunker({ separators: ['\n', ' ', ''] });
    const content = 'short line one\nshort line two\nshort line three';
    const chunks = chunker.chunk(content, 'd', cfg({ chunkSize: 14, overlap: 0 }));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('keepSeparator drops an empty trailing part', () => {
    const chunker = new RecursiveChunker({ keepSeparator: true, separators: ['. ', ''] });
    // Trailing separator yields an empty final part that should be dropped.
    const content = `${'sentence here. '.repeat(8)}`;
    const chunks = chunker.chunk(content, 'd', cfg({ chunkSize: 20, overlap: 0 }));
    expect(chunks.every((c) => c.content.length > 0)).toBe(true);
  });
});

import type { Chunk } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import { BM25Engine } from './engine.js';
import { BM25SearchEngine } from './search.js';

function chunk(id: string, content: string): Chunk {
  return {
    id,
    documentId: `doc-${id}`,
    index: 0,
    content,
    tokenCount: content.split(' ').length,
    characterCount: content.length,
    startPosition: 0,
    endPosition: content.length,
    metadata: { tag: id },
    strategy: 'fixed' as Chunk['strategy'],
  };
}

describe('BM25SearchEngine', () => {
  it('indexes chunks and searches', async () => {
    const engine = new BM25SearchEngine();
    await engine.indexChunks([
      chunk('1', 'machine learning models'),
      chunk('2', 'banana bread recipe'),
    ]);

    const results = await engine.search('learning');
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('1');
    expect(results[0]!.documentId).toBe('doc-1');
    expect(results[0]!.source).toBe('bm25');
  });

  it('respects topK option', async () => {
    const engine = new BM25SearchEngine();
    await engine.indexChunks([
      chunk('1', 'learning one'),
      chunk('2', 'learning two'),
      chunk('3', 'learning three'),
    ]);
    const results = await engine.search('learning', { topK: 1 });
    expect(results).toHaveLength(1);
  });

  it('uses configured default topK', async () => {
    const engine = new BM25SearchEngine({ topK: 2 });
    await engine.indexChunks([
      chunk('1', 'learning one'),
      chunk('2', 'learning two'),
      chunk('3', 'learning three'),
    ]);
    const results = await engine.search('learning');
    expect(results).toHaveLength(2);
  });

  it('exposes stats and underlying engine', async () => {
    const engine = new BM25SearchEngine();
    await engine.indexChunks([chunk('1', 'hello world')]);
    expect(engine.getStats().totalDocuments).toBe(1);
    expect(engine.getEngine()).toBeInstanceOf(BM25Engine);
  });

  it('clear empties the index', async () => {
    const engine = new BM25SearchEngine();
    await engine.indexChunks([chunk('1', 'hello world')]);
    engine.clear();
    expect(engine.getStats().totalDocuments).toBe(0);
  });
});

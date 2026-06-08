import { describe, expect, it } from 'vitest';
import { BM25Engine } from './engine.js';

describe('BM25Engine', () => {
  it('uses default k1/b and indexes documents', () => {
    const engine = new BM25Engine();
    engine.addDocument('1', 'the quick brown fox', { documentId: 'doc1' });
    const stats = engine.getStats();
    expect(stats.totalDocuments).toBe(1);
    expect(stats.totalTerms).toBeGreaterThan(0);
    expect(stats.avgDocLength).toBeGreaterThan(0);
  });

  it('returns [] when index empty', () => {
    const engine = new BM25Engine();
    expect(engine.search('anything')).toEqual([]);
  });

  it('ranks documents matching query terms', () => {
    const engine = new BM25Engine();
    engine.addDocuments([
      { id: '1', content: 'machine learning algorithms', metadata: { documentId: 'd1' } },
      { id: '2', content: 'cooking recipes and food', metadata: { documentId: 'd2' } },
      { id: '3', content: 'deep learning neural networks', metadata: { documentId: 'd3' } },
    ]);

    const results = engine.search('learning', 10);
    const ids = results.map((r) => r.chunkId);
    expect(ids).toContain('1');
    expect(ids).toContain('3');
    expect(ids).not.toContain('2');
    expect(results[0]!.source).toBe('bm25');
    expect(results[0]!.documentId).toBeTypeOf('string');
  });

  it('respects topK', () => {
    const engine = new BM25Engine();
    engine.addDocuments([
      { id: '1', content: 'learning one' },
      { id: '2', content: 'learning two' },
      { id: '3', content: 'learning three' },
    ]);
    expect(engine.search('learning', 2)).toHaveLength(2);
  });

  it('skips query terms not present in index', () => {
    const engine = new BM25Engine();
    engine.addDocument('1', 'apple banana');
    expect(engine.search('zebra')).toEqual([]);
  });

  it('falls back to empty metadata/documentId when missing', () => {
    const engine = new BM25Engine();
    engine.addDocument('1', 'standalone content');
    const results = engine.search('standalone');
    expect(results[0]!.documentId).toBe('');
    expect(results[0]!.metadata).toEqual({});
  });

  it('re-adding a document replaces the old entry', () => {
    const engine = new BM25Engine();
    engine.addDocument('1', 'first version apple');
    engine.addDocument('1', 'second version banana');
    expect(engine.getStats().totalDocuments).toBe(1);
    expect(engine.search('apple')).toEqual([]);
    expect(engine.search('banana')).toHaveLength(1);
  });

  it('removeDocument updates the inverted index', () => {
    const engine = new BM25Engine();
    engine.addDocuments([
      { id: '1', content: 'shared apple' },
      { id: '2', content: 'shared banana' },
    ]);
    engine.removeDocument('1');
    expect(engine.getStats().totalDocuments).toBe(1);
    // term apple fully removed (only in doc 1)
    expect(engine.search('apple')).toEqual([]);
    // shared term still resolves to remaining doc
    expect(engine.search('shared')).toHaveLength(1);
  });

  it('removeDocument on missing id is a no-op', () => {
    const engine = new BM25Engine();
    engine.addDocument('1', 'content here');
    engine.removeDocument('missing');
    expect(engine.getStats().totalDocuments).toBe(1);
  });

  it('clear empties the index', () => {
    const engine = new BM25Engine();
    engine.addDocument('1', 'content');
    engine.clear();
    const stats = engine.getStats();
    expect(stats.totalDocuments).toBe(0);
    expect(stats.avgDocLength).toBe(0);
    expect(engine.search('content')).toEqual([]);
  });

  it('honors custom k1/b parameters', () => {
    const engine = new BM25Engine({ k1: 2, b: 0.5 });
    engine.addDocument('1', 'tunable scoring example');
    const results = engine.search('tunable');
    expect(results[0]!.score).toBeGreaterThan(0);
  });
});

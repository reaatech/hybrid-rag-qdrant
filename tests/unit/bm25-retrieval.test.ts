/**
 * Unit tests for BM25 retrieval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BM25Engine, BM25SearchEngine, Tokenizer } from '../../src/retrieval/bm25/index.js';

describe('Tokenizer', () => {
  let tokenizer: Tokenizer;

  beforeEach(() => {
    tokenizer = new Tokenizer({ removeStopWords: true, useStemming: false });
  });

  it('should tokenize text into terms', () => {
    const tokens = tokenizer.tokenize('Hello world test');

    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('test');
  });

  it('should remove stop words by default', () => {
    const tokenizer = new Tokenizer({ removeStopWords: true });
    const tokens = tokenizer.tokenize('the quick brown fox');

    expect(tokens).not.toContain('the');
  });

  it('should preserve stop words when disabled', () => {
    const tokenizer = new Tokenizer({ removeStopWords: false });
    const tokens = tokenizer.tokenize('the quick brown fox');

    expect(tokens).toContain('the');
  });

  it('should support n-grams', () => {
    const tokenizer = new Tokenizer({ ngramSizes: [1, 2] });
    const tokens = tokenizer.tokenize('hello world test');

    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('test');
    expect(tokens).toContain('hello world');
    expect(tokens).toContain('world test');
  });

  it('should filter by minimum word length', () => {
    const tokenizer = new Tokenizer({ minWordLength: 4 });
    const tokens = tokenizer.tokenize('hi hello world');

    expect(tokens).not.toContain('hi');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
  });

  it('should tokenize with counts', () => {
    const counts = tokenizer.tokenizeWithCounts('hello world hello');

    expect(counts.get('hello')).toBe(2);
    expect(counts.get('world')).toBe(1);
  });

  it('should handle empty string', () => {
    const tokens = tokenizer.tokenize('');
    expect(tokens).toEqual([]);
  });

    it('should apply stemming when enabled', () => {
      const tokenizer = new Tokenizer({ useStemming: true });
      const tokens = tokenizer.tokenize('running quickly');

      // Basic stemming should strip suffixes (simple stemmer removes common suffixes)
      // 'running' -> 'runn' (strips 'ing'), 'quickly' -> 'quick' (strips 'ly')
      expect(tokens).toContain('runn');
    });
});

describe('BM25Engine', () => {
  let engine: BM25Engine;

  beforeEach(() => {
    engine = new BM25Engine({ k1: 1.2, b: 0.75 });
  });

  it('should add a single document', () => {
    engine.addDocument('doc-1', 'Hello world content');

    const results = engine.search('hello');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should add multiple documents', () => {
    engine.addDocuments([
      { id: 'doc-1', content: 'The quick brown fox' },
      { id: 'doc-2', content: 'Jumps over the lazy dog' },
      { id: 'doc-3', content: 'Hello world testing' },
    ]);

    const results = engine.search('hello world');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should return relevant documents for query', () => {
    engine.addDocuments([
      { id: 'doc-1', content: 'The quick brown fox jumps over the lazy dog' },
      { id: 'doc-2', content: 'A journey of a thousand miles begins with a single step' },
      { id: 'doc-3', content: 'To be or not to be that is the question' },
    ]);

    const results = engine.search('quick brown', 10);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkId).toBe('doc-1');
  });

  it('should respect topK parameter', () => {
    engine.addDocuments([
      { id: 'doc-1', content: 'test content number one' },
      { id: 'doc-2', content: 'test content number two' },
      { id: 'doc-3', content: 'test content number three' },
    ]);

    const results = engine.search('test', 2);

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should return empty results for no matches', () => {
    engine.addDocument('doc-1', 'Hello world');

    const results = engine.search('xyzabc123');

    expect(results.length).toBe(0);
  });

  it('should calculate IDF correctly', () => {
    engine.addDocuments([
      { id: 'doc-1', content: 'hello world' },
      { id: 'doc-2', content: 'hello test' },
      { id: 'doc-3', content: 'world test' },
    ]);

    const results = engine.search('hello');

    // 'hello' appears in 2 out of 3 documents
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should remove documents', () => {
    engine.addDocument('doc-1', 'hello world');
    engine.addDocument('doc-2', 'test content');

    engine.removeDocument('doc-1');

    const results = engine.search('hello');
    expect(results.length).toBe(0);
  });

  it('should get index statistics', () => {
    engine.addDocuments([
      { id: 'doc-1', content: 'hello world' },
      { id: 'doc-2', content: 'test content' },
    ]);

    const stats = engine.getStats();

    expect(stats.totalDocuments).toBe(2);
    expect(stats.totalTerms).toBeGreaterThan(0);
    expect(stats.avgDocLength).toBeGreaterThan(0);
  });

  it('should clear the index', () => {
    engine.addDocument('doc-1', 'hello world');
    engine.clear();

    const stats = engine.getStats();
    expect(stats.totalDocuments).toBe(0);
  });

  it('should handle empty query', () => {
    engine.addDocument('doc-1', 'hello world');

    const results = engine.search('');

    expect(results.length).toBe(0);
  });

  it('should handle custom k1 and b parameters', () => {
    const engine = new BM25Engine({ k1: 1.5, b: 0.8 });
    engine.addDocument('doc-1', 'test content');

    const results = engine.search('test');

    expect(results.length).toBeGreaterThan(0);
  });
});

describe('BM25SearchEngine', () => {
  let searchEngine: BM25SearchEngine;

  beforeEach(() => {
    searchEngine = new BM25SearchEngine({ topK: 10 });
  });

  it('should index and search chunks', async () => {
    const chunks = [
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'The quick brown fox jumps',
        tokenCount: 5,
        characterCount: 26,
        startPosition: 0,
        endPosition: 26,
        metadata: {},
        strategy: 'fixed-size' as const,
      },
      {
        id: 'chunk-2',
        documentId: 'doc-1',
        index: 1,
        content: 'over the lazy dog',
        tokenCount: 4,
        characterCount: 15,
        startPosition: 27,
        endPosition: 42,
        metadata: {},
        strategy: 'fixed-size' as const,
      },
    ];

    await searchEngine.indexChunks(chunks);
    const results = await searchEngine.search('quick fox');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('bm25');
  });

  it('should respect topK in search options', async () => {
    const chunks = [
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'test content number one',
        tokenCount: 4,
        characterCount: 22,
        startPosition: 0,
        endPosition: 22,
        metadata: {},
        strategy: 'fixed-size' as const,
      },
      {
        id: 'chunk-2',
        documentId: 'doc-1',
        index: 1,
        content: 'test content number two',
        tokenCount: 4,
        characterCount: 21,
        startPosition: 23,
        endPosition: 44,
        metadata: {},
        strategy: 'fixed-size' as const,
      },
    ];

    await searchEngine.indexChunks(chunks);
    const results = await searchEngine.search('test', { topK: 1 });

    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('should get stats from underlying engine', async () => {
    const chunks = [
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'hello world',
        tokenCount: 2,
        characterCount: 11,
        startPosition: 0,
        endPosition: 11,
        metadata: {},
        strategy: 'fixed-size' as const,
      },
    ];

    await searchEngine.indexChunks(chunks);
    const stats = searchEngine.getStats();

    expect(stats.totalDocuments).toBe(1);
  });

  it('should clear the index', async () => {
    const chunks = [
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'hello world',
        tokenCount: 2,
        characterCount: 11,
        startPosition: 0,
        endPosition: 11,
        metadata: {},
        strategy: 'fixed-size' as const,
      },
    ];

    await searchEngine.indexChunks(chunks);
    searchEngine.clear();

    const stats = searchEngine.getStats();
    expect(stats.totalDocuments).toBe(0);
  });

  it('should return result with correct structure', async () => {
    const chunks = [
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        index: 0,
        content: 'The quick brown fox jumps',
        tokenCount: 5,
        characterCount: 26,
        startPosition: 0,
        endPosition: 26,
        metadata: {},
        strategy: 'fixed-size' as const,
      },
    ];

    await searchEngine.indexChunks(chunks);
    const results = await searchEngine.search('quick');

    expect(results[0]).toHaveProperty('chunkId');
    expect(results[0]).toHaveProperty('documentId');
    expect(results[0]).toHaveProperty('content');
    expect(results[0]).toHaveProperty('score');
    expect(results[0]).toHaveProperty('source');
    expect(results[0].source).toBe('bm25');
  });
});
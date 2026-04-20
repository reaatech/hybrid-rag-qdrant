/**
 * Unit tests for reranker
 */

import { describe, it, expect } from 'vitest';
import { RerankerEngine } from '../../src/retrieval/reranker/engine.js';
import type { RetrievalResult } from '../../src/types/domain.js';

describe('reranker', () => {
  describe('reranker engine', () => {
    it('should initialize with provider configuration', () => {
      const engine = new RerankerEngine({
        provider: 'cohere',
        apiKey: 'test-key',
        topK: 10,
      });

      const config = engine.getConfig();
      expect(config.provider).toBe('cohere');
      expect(config.topK).toBe(10);
    });

    it('should use default model for provider', () => {
      const engine = new RerankerEngine({
        provider: 'openai',
      });

      const config = engine.getConfig();
      expect(config.model).toBe('gpt-4o');
    });

    it('should allow custom model', () => {
      const engine = new RerankerEngine({
        provider: 'cohere',
        model: 'custom-model',
      });

      const config = engine.getConfig();
      expect(config.model).toBe('custom-model');
    });

    it('should rerank documents', async () => {
      const engine = new RerankerEngine({
        provider: 'local',
        topK: 10,
      });

      const documents = [
        'The quick brown fox jumps over the lazy dog',
        'A journey of a thousand miles begins with a single step',
        'To be or not to be, that is the question',
      ];

      const results = await engine.rerank('quick fox', documents);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty('relevanceScore');
    });

    it('should limit to topK documents', async () => {
      const engine = new RerankerEngine({
        provider: 'local',
        topK: 2,
      });

      const documents = [
        'doc1 content',
        'doc2 content',
        'doc3 content',
        'doc4 content',
        'doc5 content',
      ];

      const results = await engine.rerank('test query', documents);

      // Should be limited by topK
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should rerank retrieval results', async () => {
      const engine = new RerankerEngine({
        provider: 'local',
        topK: 10,
        finalK: 3,
      });

      const retrievalResults: RetrievalResult[] = [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          content: 'The quick brown fox',
          score: 0.9,
          source: 'vector',
          metadata: {},
        },
        {
          chunkId: 'chunk-2',
          documentId: 'doc-2',
          content: 'A lazy dog sleeps',
          score: 0.8,
          source: 'bm25',
          metadata: {},
        },
        {
          chunkId: 'chunk-3',
          documentId: 'doc-3',
          content: 'The fox and the hound',
          score: 0.7,
          source: 'vector',
          metadata: {},
        },
      ];

      const results = await engine.rerankResults('fox dog', retrievalResults);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty('rerankScore');
    });

    it('should limit reranked results to finalK', async () => {
      const engine = new RerankerEngine({
        provider: 'local',
        topK: 10,
        finalK: 2,
      });

      const retrievalResults: RetrievalResult[] = [
        {
          chunkId: 'c1',
          documentId: 'd1',
          content: 'doc1',
          score: 0.9,
          source: 'vector',
          metadata: {},
        },
        {
          chunkId: 'c2',
          documentId: 'd2',
          content: 'doc2',
          score: 0.8,
          source: 'vector',
          metadata: {},
        },
        {
          chunkId: 'c3',
          documentId: 'd3',
          content: 'doc3',
          score: 0.7,
          source: 'vector',
          metadata: {},
        },
        {
          chunkId: 'c4',
          documentId: 'd4',
          content: 'doc4',
          score: 0.6,
          source: 'vector',
          metadata: {},
        },
      ];

      const results = await engine.rerankResults('test', retrievalResults);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty documents', async () => {
      const engine = new RerankerEngine({
        provider: 'local',
      });

      const results = await engine.rerank('query', []);

      expect(results).toHaveLength(0);
    });

    it('should handle empty retrieval results', async () => {
      const engine = new RerankerEngine({
        provider: 'local',
      });

      const results = await engine.rerankResults('query', []);

      expect(results).toHaveLength(0);
    });
  });

  describe('provider implementations', () => {
    it('Cohere provider should be available', () => {
      const engine = new RerankerEngine({
        provider: 'cohere',
        apiKey: 'test-key',
      });

      expect(engine.getConfig().provider).toBe('cohere');
    });

    it('Jina provider should be available', () => {
      const engine = new RerankerEngine({
        provider: 'jina',
        apiKey: 'test-key',
      });

      expect(engine.getConfig().provider).toBe('jina');
    });

    it('OpenAI provider should be available', () => {
      const engine = new RerankerEngine({
        provider: 'openai',
        apiKey: 'test-key',
      });

      expect(engine.getConfig().provider).toBe('openai');
    });

    it('Local provider should be available', () => {
      const engine = new RerankerEngine({
        provider: 'local',
      });

      expect(engine.getConfig().provider).toBe('local');
    });
  });

  describe('reranker scoring', () => {
    it('should return scores between 0 and 1', async () => {
      const engine = new RerankerEngine({
        provider: 'local',
      });

      const results = await engine.rerank('test query', ['Document content here']);

      expect(results[0].relevanceScore).toBeGreaterThanOrEqual(0);
      expect(results[0].relevanceScore).toBeLessThanOrEqual(1);
    });

    it('should return results sorted by score', async () => {
      const engine = new RerankerEngine({
        provider: 'local',
      });

      const results = await engine.rerank('test', ['doc1', 'doc2', 'doc3']);

      // Results should be sorted descending by relevance
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
      }
    });
  });
});

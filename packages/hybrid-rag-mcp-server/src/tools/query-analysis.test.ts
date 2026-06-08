import { describe, expect, it } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  queryAnalysisTools,
  ragAnalyzeQuery,
  ragClassifyIntent,
  ragDecomposeQuery,
} from './query-analysis.js';

describe('queryAnalysisTools registry', () => {
  it('exports three tools', () => {
    expect(queryAnalysisTools.map((t) => t.name)).toEqual([
      'rag.analyze_query',
      'rag.decompose_query',
      'rag.classify_intent',
    ]);
  });
});

describe('rag.analyze_query', () => {
  it('classifies a procedural how-to query', async () => {
    const res = await ragAnalyzeQuery.handler(
      { query: 'How to install the package?' },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.intent).toBe('procedural');
    expect(payload.confidence).toBe(0.8);
    expect(payload.recommended_config).toBeDefined();
  });

  it('falls back to factual with lower confidence when no pattern matches', async () => {
    const res = await ragAnalyzeQuery.handler({ query: 'banana split sundae' }, makePipeline({}));
    const payload = parseToolResult(res);
    expect(payload.intent).toBe('factual');
    expect(payload.confidence).toBe(0.6);
  });

  it('marks multi-part queries as complex and records context keys', async () => {
    const res = await ragAnalyzeQuery.handler(
      {
        query: 'How to install and how to configure it?',
        context: { user_tier: 'enterprise', previous_queries: ['x'] },
      },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.isComplex).toBe(true);
    expect(payload.sub_queries).toBeDefined();
    expect(payload.context_used).toEqual(['user_tier', 'previous_queries']);
  });
});

describe('rag.decompose_query', () => {
  it('splits on conjunctions and keeps confident sub-queries', async () => {
    const res = await ragDecomposeQuery.handler(
      { query: 'Explain vector search and explain bm25 ranking' },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect((payload.sub_queries as unknown[]).length).toBeGreaterThan(1);
    expect(payload.strategy).toBe('parallel');
  });

  it('filters out low-confidence (short) sub-queries above the threshold', async () => {
    const res = await ragDecomposeQuery.handler(
      { query: 'a and b', minSubQueryConfidence: 0.8 },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    // Both "a" and "b" are short (<10 chars) -> confidence 0.6 < 0.8 -> filtered.
    expect(payload.total_sub_queries).toBe(0);
    expect(payload.filtered_count).toBeGreaterThan(0);
  });

  it('handles question-word based decomposition for single-clause queries', async () => {
    const res = await ragDecomposeQuery.handler(
      {
        query: 'what is retrieval augmented generation how does hybrid search ranking work',
        minSubQueryConfidence: 0,
      },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect((payload.sub_queries as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it('returns the original query when no decomposition applies', async () => {
    const res = await ragDecomposeQuery.handler(
      { query: 'Explain retrieval augmented generation thoroughly' },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.total_sub_queries).toBe(1);
  });
});

describe('rag.classify_intent', () => {
  it('classifies and returns a description plus strategy', async () => {
    const res = await ragClassifyIntent.handler(
      { query: 'What is a vector database?' },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(['definitional', 'factual']).toContain(payload.intent);
    expect(typeof payload.description).toBe('string');
    expect(payload.recommended_strategy).toBeDefined();
  });

  it('restricts classification to provided candidates', async () => {
    const res = await ragClassifyIntent.handler(
      { query: 'error not working broken', candidates: ['troubleshooting', 'comparative'] },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.intent).toBe('troubleshooting');
    expect(payload.all_intents).toEqual(['troubleshooting', 'comparative']);
  });

  it('classifies comparative queries', async () => {
    const res = await ragClassifyIntent.handler(
      { query: 'compare qdrant versus pinecone which is better' },
      makePipeline({}),
    );
    expect(parseToolResult(res).intent).toBe('comparative');
  });

  it('classifies exploratory queries', async () => {
    const res = await ragClassifyIntent.handler(
      { query: 'tell me about embeddings and information about indexing' },
      makePipeline({}),
    );
    expect(['exploratory', 'definitional', 'factual']).toContain(parseToolResult(res).intent);
  });
});

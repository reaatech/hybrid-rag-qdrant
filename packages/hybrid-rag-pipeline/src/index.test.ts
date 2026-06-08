import { describe, expect, it, vi } from 'vitest';

// The index re-exports from pipeline.js, which pulls in the workspace deps.
// Mock them so importing the barrel does not require live services.
vi.mock('@reaatech/hybrid-rag', () => ({
  ChunkingStrategy: { FIXED_SIZE: 'fixed-size' },
}));
vi.mock('@reaatech/hybrid-rag-embedding', () => ({
  EmbeddingService: { getDimension: () => 1536 },
}));
vi.mock('@reaatech/hybrid-rag-ingestion', () => ({
  chunkDocument: vi.fn(),
}));
vi.mock('@reaatech/hybrid-rag-retrieval', () => ({
  createVectorStore: vi.fn(),
  HybridRetriever: class {},
  RerankerEngine: class {},
}));
vi.mock('@reaatech/context-window-planner', () => ({
  ContextPlanner: class {},
  createRAGChunk: vi.fn(),
  createTokenizer: vi.fn(),
  createStrategy: vi.fn(),
}));

import * as barrel from './index.js';

describe('package barrel exports', () => {
  it('re-exports the RAGPipeline class', () => {
    expect(typeof barrel.RAGPipeline).toBe('function');
  });
});

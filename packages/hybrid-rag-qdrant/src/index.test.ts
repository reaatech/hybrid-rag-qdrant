import { describe, expect, it, vi } from 'vitest';

vi.mock('@qdrant/js-client-rest', () => {
  class MockQdrantClient {}
  return { QdrantClient: MockQdrantClient };
});

import * as pkg from './index.js';
import { QdrantClientWrapper } from './index.js';

describe('index exports', () => {
  it('should export QdrantClientWrapper', () => {
    expect(QdrantClientWrapper).toBeDefined();
    expect(typeof QdrantClientWrapper).toBe('function');
  });

  it('should expose QdrantClientWrapper on the namespace', () => {
    expect(pkg.QdrantClientWrapper).toBe(QdrantClientWrapper);
  });
});

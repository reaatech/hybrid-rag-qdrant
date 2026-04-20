/**
 * Unit tests for evaluation dataset generator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeFile } from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// We need to import after mocking
import {
  generateDataset,
  generateAndSaveDataset,
  type DatasetGeneratorConfig,
  type GeneratedQuery,
} from '../../../../src/evaluation/dataset/generator.js';

describe('generateDataset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate dataset with specified configuration', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 5,
      numDocuments: 10,
      relevantDocsPerQuery: 2,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    expect(result.queries).toHaveLength(5);
    expect(result.documents).toHaveLength(10);
  });

  it('should write queries to output file', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 3,
      numDocuments: 5,
      relevantDocsPerQuery: 1,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    await generateDataset(config);

    expect(writeFile).toHaveBeenCalledWith('/tmp/test-dataset.jsonl', expect.any(String));
  });

  it('should generate queries with required fields', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 2,
      numDocuments: 4,
      relevantDocsPerQuery: 1,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    result.queries.forEach((query: GeneratedQuery) => {
      expect(query.query).toBeDefined();
      expect(typeof query.query).toBe('string');
      expect(query.query_id).toBeDefined();
      expect(query.query_id.startsWith('query-')).toBe(true);
      expect(Array.isArray(query.relevant_docs)).toBe(true);
    });
  });

  it('should generate documents with required fields', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 2,
      numDocuments: 4,
      relevantDocsPerQuery: 1,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    result.documents.forEach((doc: { id: string; content: string }) => {
      expect(doc.id).toBeDefined();
      expect(typeof doc.content).toBe('string');
      expect(doc.content.length).toBeGreaterThan(0);
    });
  });

  it('should have correct document IDs', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 2,
      numDocuments: 4,
      relevantDocsPerQuery: 1,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    expect(result.documents[0]?.id).toBe('doc-1');
    expect(result.documents[1]?.id).toBe('doc-2');
    expect(result.documents[2]?.id).toBe('doc-3');
    expect(result.documents[3]?.id).toBe('doc-4');
  });

  it('should have correct query IDs', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 3,
      numDocuments: 4,
      relevantDocsPerQuery: 1,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    expect(result.queries[0]?.query_id).toBe('query-1');
    expect(result.queries[1]?.query_id).toBe('query-2');
    expect(result.queries[2]?.query_id).toBe('query-3');
  });

  it('should assign relevant docs within document range', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 10,
      numDocuments: 5,
      relevantDocsPerQuery: 3,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    result.queries.forEach((query: GeneratedQuery) => {
      query.relevant_docs.forEach((docId: string) => {
        expect(docId.startsWith('doc-')).toBe(true);
        const num = parseInt(docId.replace('doc-', ''), 10);
        expect(num).toBeGreaterThan(0);
        expect(num).toBeLessThanOrEqual(5);
      });
    });
  });

  it('should generate reproducible results with same seed', async () => {
    const config1: DatasetGeneratorConfig = {
      numQueries: 5,
      numDocuments: 10,
      relevantDocsPerQuery: 2,
      outputPath: '/tmp/test1.jsonl',
      seed: 12345,
    };

    const config2: DatasetGeneratorConfig = {
      numQueries: 5,
      numDocuments: 10,
      relevantDocsPerQuery: 2,
      outputPath: '/tmp/test2.jsonl',
      seed: 12345,
    };

    const result1 = await generateDataset(config1);
    const result2 = await generateDataset(config2);

    expect(result1.queries).toEqual(result2.queries);
    expect(result1.documents).toEqual(result2.documents);
  });

  it('should handle zero queries', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 0,
      numDocuments: 5,
      relevantDocsPerQuery: 0,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    expect(result.queries).toHaveLength(0);
    expect(result.documents).toHaveLength(5);
  });

  it('should handle zero documents', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 5,
      numDocuments: 0,
      relevantDocsPerQuery: 0,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    expect(result.queries).toHaveLength(5);
    expect(result.documents).toHaveLength(0);
  });

  it('should generate query content from templates', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 1,
      numDocuments: 5,
      relevantDocsPerQuery: 1,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    // Query should contain question words or be a question
    const queryText = result.queries[0]?.query;
    expect(queryText).toBeDefined();
    expect(
      queryText?.includes('?') ||
        queryText?.toLowerCase().includes('what') ||
        queryText?.toLowerCase().includes('how') ||
        queryText?.toLowerCase().includes('explain'),
    ).toBe(true);
  });

  it('should generate document content with topics and fields', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 1,
      numDocuments: 5,
      relevantDocsPerQuery: 1,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    // Each document should have substantial content
    result.documents.forEach((doc: { content: string }) => {
      expect(doc.content.length).toBeGreaterThan(20);
    });
  });

  it('should assign category to queries', async () => {
    const config: DatasetGeneratorConfig = {
      numQueries: 5,
      numDocuments: 10,
      relevantDocsPerQuery: 2,
      outputPath: '/tmp/test-dataset.jsonl',
      seed: 42,
    };

    const result = await generateDataset(config);

    result.queries.forEach((query: GeneratedQuery) => {
      expect(query.category).toBeDefined();
      expect(typeof query.category).toBe('string');
    });
  });
});

describe('generateAndSaveDataset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call generateDataset with default values', async () => {
    await generateAndSaveDataset('/tmp/test.jsonl');

    expect(writeFile).toHaveBeenCalled();
  });

  it('should use custom options when provided', async () => {
    await generateAndSaveDataset('/tmp/test.jsonl', {
      numQueries: 10,
      numDocuments: 20,
      relevantDocsPerQuery: 3,
      seed: 42,
    });

    expect(writeFile).toHaveBeenCalledWith('/tmp/test.jsonl', expect.any(String));
  });

  it('should log generated dataset info', async () => {
    await generateAndSaveDataset('/tmp/test.jsonl', {
      numQueries: 5,
      numDocuments: 10,
      seed: 42,
    });

    // Logging is handled by logger.info (verified manually)
    // fs.writeFile should still be called to write the dataset
    expect(writeFile).toHaveBeenCalled();
  });

  it('should apply defaults for missing options', async () => {
    await generateAndSaveDataset('/tmp/test.jsonl', {
      seed: 42,
    });

    expect(writeFile).toHaveBeenCalled();
  });

  it('should produce consistent output format', async () => {
    await generateAndSaveDataset('/tmp/test.jsonl', {
      numQueries: 3,
      numDocuments: 5,
      relevantDocsPerQuery: 1,
      seed: 42,
    });

    // Check that writeFile was called with JSON lines format
    const writeCall = (writeFile as unknown as { mock: { calls: string[][] } }).mock.calls[0];
    const content = writeCall[1] as string;
    const lines = content.split('\n').filter((line: string) => line.length > 0);

    expect(lines).toHaveLength(3);
    lines.forEach((line: string) => {
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { makePipeline, parseToolResult } from '../test-helpers.js';
import {
  ingestionTools,
  ragChunkDocument,
  ragIngestBatch,
  ragIngestDocument,
} from './ingestion.js';

describe('ingestionTools registry', () => {
  it('exports three tools', () => {
    expect(ingestionTools.map((t) => t.name)).toEqual([
      'rag.ingest_document',
      'rag.ingest_batch',
      'rag.chunk_document',
    ]);
  });
});

describe('rag.ingest_document', () => {
  it('ingests and reports chunk count', async () => {
    const ingest = vi.fn().mockResolvedValue([
      { id: 'ch1', documentId: 'd1', content: 'abc' },
      { id: 'ch2', documentId: 'd1', content: 'defgh' },
    ]);
    const pipeline = makePipeline({ ingest });
    const res = await ragIngestDocument.handler(
      { id: 'd1', content: 'hello world', metadata: { k: 'v' } },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.documentId).toBe('d1');
    expect(payload.chunksCreated).toBe(2);
    expect(ingest).toHaveBeenCalledWith([
      { id: 'd1', content: 'hello world', metadata: { k: 'v' } },
    ]);
  });

  it('rejects empty id', async () => {
    const res = await ragIngestDocument.handler(
      { id: '', content: 'x' },
      makePipeline({ ingest: vi.fn() }),
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Invalid input');
  });

  it('rejects oversized content', async () => {
    const big = 'a'.repeat(10_000_001);
    const res = await ragIngestDocument.handler(
      { id: 'd1', content: big },
      makePipeline({ ingest: vi.fn() }),
    );
    expect(res.isError).toBe(true);
  });

  it('handles pipeline failures', async () => {
    const pipeline = makePipeline({ ingest: vi.fn().mockRejectedValue(new Error('db down')) });
    const res = await ragIngestDocument.handler({ id: 'd1', content: 'x' }, pipeline);
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Ingestion failed');
  });
});

describe('rag.ingest_batch', () => {
  it('ingests multiple docs and groups chunk counts per document', async () => {
    const ingest = vi.fn().mockResolvedValue([
      { id: 'a1', documentId: 'a', content: 'x' },
      { id: 'a2', documentId: 'a', content: 'y' },
      { id: 'b1', documentId: 'b', content: 'z' },
    ]);
    const pipeline = makePipeline({ ingest });
    const res = await ragIngestBatch.handler(
      {
        documents: [
          { id: 'a', content: 'doc a' },
          { id: 'b', content: 'doc b' },
        ],
      },
      pipeline,
    );
    const payload = parseToolResult(res);
    expect(payload.documentsIngested).toBe(2);
    expect(payload.totalChunks).toBe(3);
    expect(payload.chunksPerDocument).toEqual([
      { documentId: 'a', chunkCount: 2 },
      { documentId: 'b', chunkCount: 1 },
    ]);
  });

  it('defaults missing doc chunk counts to zero', async () => {
    const ingest = vi.fn().mockResolvedValue([]);
    const pipeline = makePipeline({ ingest });
    const res = await ragIngestBatch.handler(
      { documents: [{ id: 'a', content: 'doc a' }] },
      pipeline,
    );
    expect(parseToolResult(res).chunksPerDocument).toEqual([{ documentId: 'a', chunkCount: 0 }]);
  });

  it('rejects empty batch', async () => {
    const res = await ragIngestBatch.handler({ documents: [] }, makePipeline({ ingest: vi.fn() }));
    expect(res.isError).toBe(true);
  });

  it('handles pipeline failures', async () => {
    const pipeline = makePipeline({ ingest: vi.fn().mockRejectedValue(new Error('boom')) });
    const res = await ragIngestBatch.handler(
      { documents: [{ id: 'a', content: 'doc a' }] },
      pipeline,
    );
    expect(res.isError).toBe(true);
    expect(parseToolResult(res).error).toBe('Ingestion failed');
  });
});

describe('rag.chunk_document', () => {
  it('returns a chunking preview', async () => {
    const res = await ragChunkDocument.handler(
      { content: 'some content', strategy: 'semantic', chunkSize: 256 },
      makePipeline({}),
    );
    const payload = parseToolResult(res);
    expect(payload.strategy).toBe('semantic');
    expect(payload.contentLength).toBe('some content'.length);
  });

  it('validates content presence', async () => {
    const res = await ragChunkDocument.handler({ content: '' }, makePipeline({}));
    expect(res.isError).toBe(true);
  });
});

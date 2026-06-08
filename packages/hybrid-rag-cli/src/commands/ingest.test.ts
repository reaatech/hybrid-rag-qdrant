import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag-ingestion', () => ({
  DocumentLoader: class {
    load = loadMock;
  },
}));

import { readFile } from 'node:fs/promises';
import { ingestCommand } from './ingest.js';

const readFileMock = vi.mocked(readFile);

interface MockPipeline {
  ingest: ReturnType<typeof vi.fn>;
}

function makePipeline(chunks: unknown[] = []): MockPipeline {
  return { ingest: vi.fn().mockResolvedValue(chunks) };
}

const options = {
  chunkSize: '512',
  overlap: '50',
  strategy: 'recursive',
  collection: 'documents',
};

describe('ingestCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    loadMock.mockReset();
    readFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads non-json files via DocumentLoader and ingests', async () => {
    loadMock.mockResolvedValue({ content: 'hello world' });
    const pipeline = makePipeline([{ id: 'a' }, { id: 'b' }]);

    await ingestCommand(['doc.md'], options, pipeline as never);

    expect(loadMock).toHaveBeenCalledWith('doc.md');
    expect(pipeline.ingest).toHaveBeenCalledTimes(1);
    const docs = pipeline.ingest.mock.calls[0][0];
    expect(docs).toHaveLength(1);
    expect(docs[0].content).toBe('hello world');
    expect(docs[0].metadata.source).toBe('doc.md');
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Ingesting 1 files');
    expect(out).toContain('Successfully ingested 2 chunks from 1 documents');
  });

  it('parses json files as a single document', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({ content: 'json body', metadata: { k: 'v' } }) as never,
    );
    const pipeline = makePipeline([{ id: 'c' }]);

    await ingestCommand(['data.json'], options, pipeline as never);

    expect(readFileMock).toHaveBeenCalledWith('data.json', 'utf-8');
    expect(loadMock).not.toHaveBeenCalled();
    const docs = pipeline.ingest.mock.calls[0][0];
    // .json falls through to default push using `content` (whole file string)
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('data.json');
  });

  it('parses jsonl files into one document per line', async () => {
    readFileMock.mockResolvedValue(
      [
        JSON.stringify({ id: 'r1', content: 'line one' }),
        '',
        JSON.stringify({ id: 'r2', text: 'line two', metadata: { x: 1 } }),
      ].join('\n') as never,
    );
    const pipeline = makePipeline([{ id: '1' }, { id: '2' }]);

    await ingestCommand(['data.jsonl'], options, pipeline as never);

    const docs = pipeline.ingest.mock.calls[0][0];
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ id: 'r1', content: 'line one' });
    expect(docs[1]).toMatchObject({ id: 'r2', content: 'line two' });
  });

  it('falls back to file name and empty content for sparse jsonl rows', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({}) as never);
    const pipeline = makePipeline([{ id: '1' }]);

    await ingestCommand(['sparse.jsonl'], options, pipeline as never);

    const docs = pipeline.ingest.mock.calls[0][0];
    expect(docs[0]).toMatchObject({ id: 'sparse.jsonl', content: '', metadata: {} });
  });

  it('logs an error and skips files that fail to load', async () => {
    loadMock.mockRejectedValue(new Error('boom'));
    const pipeline = makePipeline();

    await ingestCommand(['broken.txt'], options, pipeline as never);

    expect(errorSpy).toHaveBeenCalledWith('Error loading file broken.txt:', 'boom');
    expect(pipeline.ingest).not.toHaveBeenCalled();
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('No documents to ingest.');
  });
});

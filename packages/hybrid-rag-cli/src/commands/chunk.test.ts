import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chunkDocumentMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@reaatech/hybrid-rag-ingestion', () => ({
  chunkDocument: (...args: unknown[]) => chunkDocumentMock(...args),
}));

import { readFile, writeFile } from 'node:fs/promises';
import { chunkCommand } from './chunk.js';

const readFileMock = vi.mocked(readFile);
const writeFileMock = vi.mocked(writeFile);

describe('chunkCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    chunkDocumentMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the file, chunks it, writes results and logs a summary', async () => {
    const content = 'alpha beta gamma delta';
    readFileMock.mockResolvedValue(content as never);
    chunkDocumentMock.mockResolvedValue([
      { id: 'c1', content: 'alpha beta' },
      { id: 'c2', content: 'gamma delta' },
    ]);

    await chunkCommand('doc.txt', {
      strategy: 'recursive',
      chunkSize: 512,
      overlap: 50,
      output: 'chunks.json',
    });

    expect(readFileMock).toHaveBeenCalledWith('doc.txt', 'utf-8');
    expect(chunkDocumentMock).toHaveBeenCalledWith(content, 'doc.txt', {
      strategy: 'recursive',
      chunkSize: 512,
      overlap: 50,
    });

    const [path, body] = writeFileMock.mock.calls[0];
    expect(path).toBe('chunks.json');
    const parsed = JSON.parse(body as string);
    expect(parsed.total_chunks).toBe(2);
    expect(parsed.chunks[0]).toMatchObject({ index: 0, id: 'c1', start_position: 0 });
    expect(parsed.chunks[1].start_position).toBe(content.indexOf('gamma delta'));

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Chunking file: doc.txt');
    expect(out).toContain('Total chunks: 2');
    expect(out).toContain('Results saved to: chunks.json');
  });
});

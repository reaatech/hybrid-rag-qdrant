import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DocumentLoader,
  DocumentParseError,
  FileSizeExceededError,
  UnsupportedFormatError,
} from './loader.js';

const getTextMock = vi.fn();

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn(function PDFParse(this: Record<string, unknown>) {
    this.getText = getTextMock;
  }),
}));

let tmpDir: string;

function write(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('custom error classes', () => {
  it('UnsupportedFormatError carries the format', () => {
    const e = new UnsupportedFormatError('xyz');
    expect(e.name).toBe('UnsupportedFormatError');
    expect(e.message).toContain('xyz');
  });

  it('FileSizeExceededError reports sizes', () => {
    const e = new FileSizeExceededError(100, 50);
    expect(e.name).toBe('FileSizeExceededError');
    expect(e.message).toContain('100');
  });

  it('DocumentParseError keeps partial content', () => {
    const e = new DocumentParseError('boom', 'partial');
    expect(e.name).toBe('DocumentParseError');
    expect(e.partialContent).toBe('partial');
    const e2 = new DocumentParseError('boom');
    expect(e2.partialContent).toBeUndefined();
  });
});

describe('DocumentLoader.load', () => {
  it('loads a plain text file with metadata', async () => {
    const file = write('sample.txt', 'Hello world this is a text document with words.');
    const loader = new DocumentLoader();
    const doc = await loader.load(file);
    expect(doc.content).toContain('Hello world');
    expect(doc.contentType).toBe('text/plain');
    expect(doc.id).toMatch(/^doc-/);
    expect(doc.contentHash).toBeDefined();
    expect(doc.metadata?.filename).toBe('sample.txt');
    expect(doc.metadata?.wordCount).toBeGreaterThan(0);
  });

  it('loads a markdown file and extracts title from heading', async () => {
    const md =
      '# My Title\n\nThis is a paragraph.\n\n## Sub heading\n\n- item one\n- item two\n\n```\ncode block\n```\n';
    const file = write('doc.md', md);
    const loader = new DocumentLoader();
    const doc = await loader.load(file);
    expect(doc.contentType).toBe('text/markdown');
    expect(doc.content).toContain('My Title');
    expect(doc.metadata?.title).toBe('My Title');
  });

  it('handles markdown with deep headings and block quotes', async () => {
    // Level-4 heading is skipped (depth > 3); blockquote hits the default branch.
    const md =
      '# Top\n\n#### Deep heading skipped\n\n> A quoted block of text.\n\nTrailing paragraph content.\n';
    const file = write('deep.md', md);
    const loader = new DocumentLoader();
    const doc = await loader.load(file);
    expect(doc.content).toContain('Top');
    expect(doc.content).not.toContain('Deep heading skipped');
    expect(doc.content).toContain('quoted block');
  });

  it('loads markdown with no leading heading (no title metadata)', async () => {
    const md = 'Just a plain paragraph with several words and no heading at all.\n';
    const file = write('notitle.md', md);
    const loader = new DocumentLoader();
    const doc = await loader.load(file);
    expect(doc.metadata?.title).toBeUndefined();
  });

  it('loads an HTML file stripping scripts and styles', async () => {
    const html =
      '<html><head><style>.x{}</style></head><body><nav>menu</nav><main><p>Main content here.</p></main><script>1</script></body></html>';
    const file = write('page.html', html);
    const loader = new DocumentLoader();
    const doc = await loader.load(file);
    expect(doc.contentType).toBe('text/html');
    expect(doc.content).toContain('Main content here.');
    expect(doc.content).not.toContain('menu');
  });

  it('loads HTML falling back to body when no main element', async () => {
    const html = '<html><body><p>Just body text.</p></body></html>';
    const file = write('page2.htm', html);
    const loader = new DocumentLoader();
    const doc = await loader.load(file);
    expect(doc.content).toContain('Just body text.');
  });

  it('loads a PDF using the mocked parser', async () => {
    getTextMock.mockResolvedValue({ text: 'Extracted PDF text content.' });
    const file = write('doc.pdf', '%PDF-1.4 fake');
    const loader = new DocumentLoader();
    const doc = await loader.load(file);
    expect(doc.content).toBe('Extracted PDF text content.');
    expect(doc.contentType).toBe('application/pdf');
  });

  it('wraps PDF parse failures in DocumentParseError', async () => {
    getTextMock.mockRejectedValue(new Error('corrupt'));
    const file = write('bad.pdf', '%PDF bad');
    const loader = new DocumentLoader();
    await expect(loader.load(file)).rejects.toBeInstanceOf(DocumentParseError);
  });

  it('throws when the file does not exist', async () => {
    const loader = new DocumentLoader();
    await expect(loader.load(path.join(tmpDir, 'nope.txt'))).rejects.toThrow(/File not found/);
  });

  it('throws FileSizeExceededError when over the limit', async () => {
    const file = write('big.txt', 'x'.repeat(2000));
    const loader = new DocumentLoader({ maxFileSize: 100 });
    await expect(loader.load(file)).rejects.toBeInstanceOf(FileSizeExceededError);
  });

  it('throws UnsupportedFormatError for disallowed extensions', async () => {
    const file = write('data.csv', 'a,b,c');
    const loader = new DocumentLoader();
    await expect(loader.load(file)).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it('skips metadata extraction when disabled', async () => {
    const file = write('nometa.txt', 'Some content here.');
    const loader = new DocumentLoader({ extractMetadata: false });
    const doc = await loader.load(file);
    expect(doc.metadata).toEqual({});
  });
});

describe('DocumentLoader.loadBatch', () => {
  it('loads multiple documents and skips failures', async () => {
    const a = write('a.txt', 'Document A content.');
    const b = write('b.txt', 'Document B content.');
    const loader = new DocumentLoader();
    const docs = await loader.loadBatch([a, b, path.join(tmpDir, 'missing.txt')]);
    expect(docs).toHaveLength(2);
  });

  it('throws AggregateError when all documents fail', async () => {
    const loader = new DocumentLoader();
    await expect(
      loader.loadBatch([path.join(tmpDir, 'x.txt'), path.join(tmpDir, 'y.txt')]),
    ).rejects.toBeInstanceOf(AggregateError);
  });
});

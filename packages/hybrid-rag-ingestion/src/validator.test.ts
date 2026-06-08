import type { Document } from '@reaatech/hybrid-rag';
import { describe, expect, it } from 'vitest';
import { DocumentValidator } from './validator.js';

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    content: 'a'.repeat(600),
    source: 'test.txt',
    title: 'Title',
    contentType: 'text/plain',
    metadata: { foo: 'bar' },
    ...overrides,
  } as unknown as Document;
}

describe('DocumentValidator.validate', () => {
  it('accepts a well-formed document', () => {
    const v = new DocumentValidator();
    const result = v.validate(doc());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when id is missing', () => {
    const v = new DocumentValidator();
    const result = v.validate(doc({ id: '   ' }));
    expect(result.errors).toContain('Document ID is required');
  });

  it('errors and short-circuits when content is empty', () => {
    const v = new DocumentValidator();
    const result = v.validate(doc({ content: '   ' }));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Document content is required');
  });

  it('errors when file size exceeds the maximum', () => {
    const v = new DocumentValidator({ maxFileSize: 10 });
    const result = v.validate(doc({ fileSize: 100 } as Partial<Document>));
    expect(result.errors.some((e) => e.includes('exceeds maximum'))).toBe(true);
  });

  it('errors when content is below minimum length', () => {
    const v = new DocumentValidator({ minContentLength: 100 });
    const result = v.validate(doc({ content: 'short content here' }));
    expect(result.errors.some((e) => e.includes('below minimum'))).toBe(true);
  });

  it('errors when content exceeds maximum length', () => {
    const v = new DocumentValidator({ maxContentLength: 10 });
    const result = v.validate(doc({ content: 'a'.repeat(600) }));
    expect(result.errors.some((e) => e.includes('exceeds maximum'))).toBe(true);
  });

  it('errors when content type is not allowed', () => {
    const v = new DocumentValidator();
    const result = v.validate(doc({ contentType: 'image/png' }));
    expect(result.errors.some((e) => e.includes('not allowed'))).toBe(true);
  });

  it('detects duplicate content via content hash', () => {
    const v = new DocumentValidator();
    const d = doc({ contentHash: 'abc123' } as Partial<Document>);
    expect(v.validate(d).isValid).toBe(true);
    const second = v.validate(doc({ id: 'doc-2', contentHash: 'abc123' } as Partial<Document>));
    expect(second.errors).toContain(
      'Document content is a duplicate of a previously ingested document',
    );
  });

  it('computes a content hash when none is supplied', () => {
    const v = new DocumentValidator();
    const first = v.validate(doc());
    expect(first.isValid).toBe(true);
    const dup = v.validate(doc({ id: 'doc-3' }));
    expect(dup.errors).toContain(
      'Document content is a duplicate of a previously ingested document',
    );
  });

  it('skips duplicate checking when disabled', () => {
    const v = new DocumentValidator({ checkDuplicates: false });
    v.validate(doc());
    expect(v.validate(doc({ id: 'doc-4' })).isValid).toBe(true);
  });

  it('emits warnings for missing title, short content, and empty metadata', () => {
    const v = new DocumentValidator({ minContentLength: 1 });
    const result = v.validate(
      doc({ title: undefined, content: 'tiny', metadata: {} } as Partial<Document>),
    );
    expect(result.warnings).toContain('Document has no title');
    expect(result.warnings).toContain('Document content is very short (< 500 characters)');
    expect(result.warnings).toContain('Document has no metadata');
  });

  it('reset clears duplicate tracking', () => {
    const v = new DocumentValidator();
    v.validate(doc());
    v.reset();
    expect(v.validate(doc({ id: 'doc-5' })).isValid).toBe(true);
  });
});

describe('DocumentValidator.validateBatch', () => {
  it('validates a batch returning per-document results', () => {
    const v = new DocumentValidator();
    const results = v.validateBatch([doc(), doc({ id: 'doc-6', content: 'b'.repeat(600) })]);
    expect(results).toHaveLength(2);
    expect(results[0]?.result.isValid).toBe(true);
  });
});

describe('DocumentValidator static helpers', () => {
  it('isValidTextContent rejects null bytes and high non-printable ratios', () => {
    expect(DocumentValidator.isValidTextContent('normal text')).toBe(true);
    expect(DocumentValidator.isValidTextContent('bad\0content')).toBe(false);
    expect(DocumentValidator.isValidTextContent('')).toBe(true);
  });

  it('detectEncoding recognizes BOMs', () => {
    expect(DocumentValidator.detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('utf-8');
    expect(DocumentValidator.detectEncoding(Buffer.from([0xff, 0xfe, 0x41]))).toBe('utf16le');
    expect(DocumentValidator.detectEncoding(Buffer.from([0xfe, 0xff, 0x41]))).toBe('utf-16be');
    expect(DocumentValidator.detectEncoding(Buffer.from([0x41, 0x42]))).toBe('utf-8');
  });
});

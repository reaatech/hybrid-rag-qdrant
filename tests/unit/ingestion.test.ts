import { describe, it, expect } from 'vitest';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ingestion', () => {
  describe('document loader', () => {
    it('should load plain text files', async () => {
      const { DocumentLoader } = await import('../../src/ingestion/loader.js');

      const loader = new DocumentLoader();
      const content = 'Hello, this is a test document.';

      const tempPath = join(tmpdir(), `test-${Date.now()}.txt`);
      await writeFile(tempPath, content);

      const doc = await loader.load(tempPath);

      expect(doc).toBeDefined();
      expect(doc.content).toBe(content);
      expect(doc.contentType).toBe('text/plain');
    });

    it('should load markdown files', async () => {
      const { DocumentLoader } = await import('../../src/ingestion/loader.js');

      const loader = new DocumentLoader();
      const content = '# Test\n\nThis is a **markdown** document.';

      const tempPath = join(tmpdir(), `test-${Date.now()}.md`);
      await writeFile(tempPath, content);

      const doc = await loader.load(tempPath);

      expect(doc).toBeDefined();
      expect(doc.contentType).toBe('text/markdown');
    });

    it('should load HTML files', async () => {
      const { DocumentLoader } = await import('../../src/ingestion/loader.js');

      const loader = new DocumentLoader();
      const content = '<html><body><h1>Test</h1><p>Hello world</p></body></html>';

      const tempPath = join(tmpdir(), `test-${Date.now()}.html`);
      await writeFile(tempPath, content);

      const doc = await loader.load(tempPath);

      expect(doc).toBeDefined();
      expect(doc.contentType).toBe('text/html');
    });

    it('should handle non-existent files', async () => {
      const { DocumentLoader } = await import('../../src/ingestion/loader.js');

      const loader = new DocumentLoader();

      await expect(loader.load('/nonexistent/file.txt')).rejects.toThrow();
    });

    it('should reject unsupported formats', async () => {
      const { DocumentLoader, UnsupportedFormatError } = await import('../../src/ingestion/loader.js');

      const loader = new DocumentLoader();
      const content = 'binary content';

      const tempPath = join(tmpdir(), `test-${Date.now()}.xyz`);
      await writeFile(tempPath, content);

      await expect(loader.load(tempPath)).rejects.toThrow(UnsupportedFormatError);
    });
  });

  describe('document validator', () => {
    it('should validate a proper document', async () => {
      const { DocumentValidator } = await import('../../src/ingestion/validator.js');

      const validator = new DocumentValidator({ minContentLength: 10 });

      const doc = {
        id: 'test-doc',
        content: 'This is valid content that is long enough to pass validation requirements.',
        source: 'test',
        contentHash: 'abc123',
        fileSize: 100,
        contentType: 'text/plain',
        metadata: {},
      };

      const result = validator.validate(doc);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty document content', async () => {
      const { DocumentValidator } = await import('../../src/ingestion/validator.js');

      const validator = new DocumentValidator({});

      const doc = {
        id: 'test-doc',
        content: '',
        source: 'test',
        metadata: {},
      };

      const result = validator.validate(doc);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject duplicate content', async () => {
      const { DocumentValidator } = await import('../../src/ingestion/validator.js');

      const validator = new DocumentValidator({ checkDuplicates: true, minContentLength: 10 });

      const doc1 = {
        id: 'doc-1',
        content: 'Same content here for document one',
        source: 'test1',
        contentHash: 'samehash',
        metadata: {},
      };

      const doc2 = {
        id: 'doc-2',
        content: 'Same content here for document two',
        source: 'test2',
        contentHash: 'samehash',
        metadata: {},
      };

      validator.validate(doc1);
      const result = validator.validate(doc2);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Document content is a duplicate of a previously ingested document');
    });

    it('should reset duplicate tracking', async () => {
      const { DocumentValidator } = await import('../../src/ingestion/validator.js');

      const validator = new DocumentValidator({ checkDuplicates: true, minContentLength: 10 });

      const doc = {
        id: 'doc-1',
        content: 'Content for document one',
        source: 'test',
        contentHash: 'hash1',
        metadata: {},
      };

      validator.validate(doc);
      validator.reset();

      const result = validator.validate({
        ...doc,
        id: 'doc-2',
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate batch of documents', async () => {
      const { DocumentValidator } = await import('../../src/ingestion/validator.js');

      const validator = new DocumentValidator({ minContentLength: 10 });

      const docs = [
        { id: 'doc-1', content: 'Valid content here for document one that is long enough', source: 'test', metadata: {} },
        { id: 'doc-2', content: '', source: 'test', metadata: {} },
      ];

      const results = validator.validateBatch(docs);

      expect(results).toHaveLength(2);
      expect(results[0].result.isValid).toBe(true);
      expect(results[1].result.isValid).toBe(false);
    });

    it('should detect encoding from buffer', async () => {
      const { DocumentValidator } = await import('../../src/ingestion/validator.js');

      const utf8Buffer = Buffer.from([0xEF, 0xBB, 0xBF, 0x74, 0x65, 0x73, 0x74]);
      const encoding = DocumentValidator.detectEncoding(utf8Buffer);

      expect(encoding).toBe('utf-8');
    });

    it('should validate text content', async () => {
      const { DocumentValidator } = await import('../../src/ingestion/validator.js');

      expect(DocumentValidator.isValidTextContent('Hello world')).toBe(true);
      expect(DocumentValidator.isValidTextContent('Hello\x00world')).toBe(false);
    });
  });

  describe('preprocessor', () => {
    it('should preprocess text content', async () => {
      const { TextPreprocessor } = await import('../../src/ingestion/preprocessor.js');

      const preprocessor = new TextPreprocessor();
      const text = '  Héllo   Wörld  \n\n  Test  ';

      const result = preprocessor.preprocess(text);

      expect(result.content).toBeDefined();
      expect(result.originalLength).toBeGreaterThan(0);
      expect(result.processedLength).toBeGreaterThan(0);
    });

    it('should normalize unicode', async () => {
      const { TextPreprocessor } = await import('../../src/ingestion/preprocessor.js');

      const preprocessor = new TextPreprocessor({ normalizeUnicode: true });
      const text = 'Héllo Wörld — test';

      const result = preprocessor.preprocess(text);

      expect(result.content).toBeDefined();
    });

    it('should clean whitespace', async () => {
      const { TextPreprocessor } = await import('../../src/ingestion/preprocessor.js');

      const preprocessor = new TextPreprocessor({ normalizeWhitespace: true });
      const text = '  Hello   World  \n\n  Test  ';

      const result = preprocessor.preprocess(text);

      expect(result.content).not.toContain('  ');
    });

    it('should handle empty content', async () => {
      const { TextPreprocessor } = await import('../../src/ingestion/preprocessor.js');

      const preprocessor = new TextPreprocessor();
      const result = preprocessor.preprocess('');

      expect(result.content).toBe('');
      expect(result.originalLength).toBe(0);
      expect(result.processedLength).toBe(0);
    });

    it('should preserve meaningful whitespace', async () => {
      const { TextPreprocessor } = await import('../../src/ingestion/preprocessor.js');

      const preprocessor = new TextPreprocessor();
      const text = 'Paragraph one.\n\nParagraph two.';

      const result = preprocessor.preprocess(text);

      expect(result.content).toContain('Paragraph');
    });
  });
});
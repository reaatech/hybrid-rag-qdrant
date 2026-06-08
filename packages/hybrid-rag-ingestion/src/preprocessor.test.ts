import { describe, expect, it } from 'vitest';
import { TextPreprocessor } from './preprocessor.js';

describe('TextPreprocessor.preprocess', () => {
  it('normalizes whitespace and unicode by default', () => {
    const pre = new TextPreprocessor();
    const input = 'Helloé   world\n\n\n\nmore   text   ';
    const result = pre.preprocess(input);
    expect(result.content).not.toMatch(/ {2,}/);
    expect(result.content).not.toMatch(/\n{3,}/);
    expect(result.originalLength).toBe(input.length);
    expect(result.processedLength).toBe(result.content.length);
  });

  it('can disable all transformations', () => {
    const pre = new TextPreprocessor({
      normalizeUnicode: false,
      normalizeWhitespace: false,
      removeHeadersFooters: false,
      extractTables: false,
    });
    const result = pre.preprocess('Plain   content');
    expect(result.content).toBe('Plain   content');
    expect(result.tablesExtracted).toBe(0);
    expect(result.headersFootersRemoved).toBe(false);
  });

  it('removes repeating header lines', () => {
    const pre = new TextPreprocessor({ headerFooterMinOccurrences: 3, extractTables: false });
    const header = 'ACME CORP CONFIDENTIAL';
    // The detector inspects the first 5 lines and only flags a header when they
    // are all identical, so the banner occupies those slots before the body.
    const lines = [
      header,
      header,
      header,
      header,
      header,
      'Page body content line one.',
      'Page body content line two.',
      'Page body content line three.',
      'Page body content line four.',
      'Page body content line five.',
    ];
    const result = pre.preprocess(lines.join('\n'));
    expect(result.headersFootersRemoved).toBe(true);
    expect(result.content).not.toContain(header);
  });

  it('removes repeating page-number footers', () => {
    const pre = new TextPreprocessor({ headerFooterMinOccurrences: 2, extractTables: false });
    const lines = [
      'Intro paragraph with enough text to matter here.',
      'Second paragraph of content here as well today.',
      'Third paragraph of content here as well today too.',
      'Fourth paragraph of content here as well today too.',
      'Fifth paragraph of content here as well today too.',
      '1',
      '2',
      '3',
      '4',
      '5',
    ];
    const result = pre.preprocess(lines.join('\n'));
    expect(result.headersFootersRemoved).toBe(true);
  });

  it('does not attempt header removal on short documents', () => {
    const pre = new TextPreprocessor({ extractTables: false });
    const result = pre.preprocess('line1\nline2\nline3');
    expect(result.headersFootersRemoved).toBe(false);
  });

  it('extracts a tab-separated table as markdown', () => {
    const pre = new TextPreprocessor({ removeHeadersFooters: false });
    const text = 'Intro line\nName\tAge\tCity\nAlice\t30\tNYC\nBob\t25\tLA\nOutro line';
    const result = pre.preprocess(text);
    expect(result.tablesExtracted).toBe(1);
    expect(result.content).toContain('| Name | Age | City |');
    expect(result.content).toContain('| --- | --- | --- |');
  });

  it('extracts a pipe-separated table at the end of the document', () => {
    const pre = new TextPreprocessor({ removeHeadersFooters: false });
    const text = 'Heading\n| A | B |\n| 1 | 2 |';
    const result = pre.preprocess(text);
    expect(result.tablesExtracted).toBe(1);
  });

  it('treats a single table-like row as plain text', () => {
    const pre = new TextPreprocessor({ removeHeadersFooters: false });
    const text = 'before\nSolo\tRow\nafter normal line content here';
    const result = pre.preprocess(text);
    expect(result.tablesExtracted).toBe(0);
    expect(result.content).toContain('Solo');
  });

  it('handles empty input', () => {
    const pre = new TextPreprocessor();
    const result = pre.preprocess('');
    expect(result.content).toBe('');
    expect(result.originalLength).toBe(0);
  });
});

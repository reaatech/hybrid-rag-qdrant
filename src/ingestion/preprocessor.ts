/**
 * Text preprocessing
 */

/**
 * Preprocessing options
 */
export interface PreprocessingOptions {
  /** Normalize Unicode to NFC form (default: true) */
  normalizeUnicode?: boolean;
  /** Normalize whitespace (default: true) */
  normalizeWhitespace?: boolean;
  /** Remove headers and footers (default: true) */
  removeHeadersFooters?: boolean;
  /** Extract and format tables (default: true) */
  extractTables?: boolean;
  /** Minimum lines to detect header/footer pattern (default: 3) */
  headerFooterMinOccurrences?: number;
}

/**
 * Preprocessing result
 */
export interface PreprocessingResult {
  /** Preprocessed text content */
  content: string;
  /** Whether headers/footers were detected and removed */
  headersFootersRemoved: boolean;
  /** Number of tables extracted */
  tablesExtracted: number;
  /** Original character count */
  originalLength: number;
  /** Preprocessed character count */
  processedLength: number;
}

/**
 * Text preprocessor for document cleaning
 */
export class TextPreprocessor {
  private readonly normalizeUnicode: boolean;
  private readonly normalizeWhitespace: boolean;
  private readonly removeHeadersFooters: boolean;
  private readonly extractTables: boolean;
  private readonly headerFooterMinOccurrences: number;

  constructor(options: PreprocessingOptions = {}) {
    this.normalizeUnicode = options.normalizeUnicode ?? true;
    this.normalizeWhitespace = options.normalizeWhitespace ?? true;
    this.removeHeadersFooters = options.removeHeadersFooters ?? true;
    this.extractTables = options.extractTables ?? true;
    this.headerFooterMinOccurrences = options.headerFooterMinOccurrences ?? 3;
  }

  /**
   * Preprocess document content
   */
  preprocess(content: string): PreprocessingResult {
    const originalLength = content.length;
    let processed = content;
    let headersFootersRemoved = false;
    let tablesExtracted = 0;

    // Step 1: Unicode normalization
    if (this.normalizeUnicode) {
      processed = processed.normalize('NFC');
    }

    // Step 2: Extract tables (before whitespace normalization)
    if (this.extractTables) {
      const tableResult = this.extractAndFormatTables(processed);
      processed = tableResult.content;
      tablesExtracted = tableResult.count;
    }

    // Step 3: Remove headers and footers
    if (this.removeHeadersFooters) {
      const headerFooterResult = this.removeHeaderFooterPatterns(processed);
      processed = headerFooterResult.content;
      headersFootersRemoved = headerFooterResult.removed;
    }

    // Step 4: Normalize whitespace
    if (this.normalizeWhitespace) {
      processed = this.normalizeWhitespaceText(processed);
    }

    return {
      content: processed.trim(),
      headersFootersRemoved,
      tablesExtracted,
      originalLength,
      processedLength: processed.trim().length,
    };
  }

  /**
   * Normalize Unicode characters
   */
  private _normalizeUnicodeText(text: string): string {
    return text.normalize('NFC');
  }

  /**
   * Normalize whitespace
   */
  private normalizeWhitespaceText(text: string): string {
    // Replace multiple spaces with single space (preserve newlines)
    text = text.replace(/[^\S\n]+/g, ' ');

    // Replace multiple newlines with double newline (paragraph break)
    text = text.replace(/\n{3,}/g, '\n\n');

    // Remove trailing whitespace on each line
    text = text
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n');

    return text;
  }

  /**
   * Detect and remove header/footer patterns
   */
  private removeHeaderFooterPatterns(text: string): { content: string; removed: boolean } {
    const lines = text.split('\n');
    if (lines.length < 10) {
      // Too short to have meaningful headers/footers
      return { content: text, removed: false };
    }

    // Analyze first few lines for header patterns
    const headerLines = lines.slice(0, Math.min(5, lines.length));
    const footerLines = lines.slice(-Math.min(5, lines.length));

    // Find repeating patterns in headers
    const headerPattern = this.findRepeatingPattern(headerLines);
    const footerPattern = this.findRepeatingPattern(footerLines);

    let removed = false;
    let result = text;

    // Remove header pattern from each page-like section
    if (headerPattern && this.countOccurrences(lines, headerPattern) >= this.headerFooterMinOccurrences) {
      result = this.removePatternFromLines(result, headerPattern);
      removed = true;
    }

    // Remove footer pattern from each page-like section
    if (footerPattern && this.countOccurrences(lines, footerPattern) >= this.headerFooterMinOccurrences) {
      result = this.removePatternFromLines(result, footerPattern);
      removed = true;
    }

    return { content: result, removed };
  }

  /**
   * Find repeating pattern in lines
   */
  private findRepeatingPattern(lines: string[]): string | null {
    if (lines.length === 0) {return null;}

    // Check if all lines are similar
    const firstLine = lines[0]?.trim().toLowerCase() ?? '';
    if (!firstLine) {return null;}

    const matchCount = lines.filter(line =>
      line.trim().toLowerCase() === firstLine,
    ).length;

    if (matchCount === lines.length) {
      return firstLine;
    }

    // Check for common patterns (page numbers, etc.)
    const pagePattern = /^\s*\d+\s*$/;
    if (lines.every(line => pagePattern.test(line.trim()))) {
      return 'PAGE_NUMBER';
    }

    return null;
  }

  /**
   * Count occurrences of pattern in lines
   */
  private countOccurrences(lines: string[], pattern: string): number {
    if (pattern === 'PAGE_NUMBER') {
      const pagePattern = /^\s*\d+\s*$/;
      return lines.filter(line => pagePattern.test(line.trim())).length;
    }

    return lines.filter(line => line.trim().toLowerCase() === pattern).length;
  }

  /**
   * Remove pattern from lines
   */
  private removePatternFromLines(text: string, pattern: string): string {
    const lines = text.split('\n');

    return lines
      .filter(line => {
        const trimmed = line.trim().toLowerCase();
        if (pattern === 'PAGE_NUMBER') {
          return !/^\s*\d+\s*$/.test(trimmed);
        }
        return trimmed !== pattern;
      })
      .join('\n');
  }

  /**
   * Extract and format tables as markdown
   */
  private extractAndFormatTables(text: string): { content: string; count: number } {
    let count = 0;

    // Detect table-like structures (rows with consistent column separators)
    const lines = text.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[][] = [];

    for (const line of lines) {
      // Detect tab-separated or pipe-separated tables
      const tabColumns = line.split('\t');
      const pipeColumns = line.split('|').filter(c => c.trim() !== '');

      if (tabColumns.length >= 2 || pipeColumns.length >= 2) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }

        const columns = tabColumns.length >= 2 ? tabColumns : pipeColumns;
        tableRows.push(columns.map(c => c.trim()));
      } else {
        if (inTable && tableRows.length >= 2) {
          // End of table, format as markdown
          result.push(this.formatTableAsMarkdown(tableRows));
          count++;
          inTable = false;
          tableRows = [];
        } else if (inTable) {
          // Not enough rows for a table, add as regular text
          for (const row of tableRows) {
            result.push(row.join('\t'));
          }
          inTable = false;
          tableRows = [];
        }

        result.push(line);
      }
    }

    // Handle table at end of document
    if (inTable && tableRows.length >= 2) {
      result.push(this.formatTableAsMarkdown(tableRows));
      count++;
    }

    return { content: result.join('\n'), count };
  }

  /**
   * Format table rows as markdown
   */
  private formatTableAsMarkdown(rows: string[][]): string {
    if (rows.length === 0) {return '';}

    // Determine column count
    const colCount = Math.max(...rows.map(r => r.length));

    // Normalize rows to same column count
    const normalizedRows = rows.map(row => {
      while (row.length < colCount) {
        row.push('');
      }
      return row;
    });

    // Build markdown table
    const header = normalizedRows[0] ?? [];
    const markdownRows: string[] = [];

    // Header row
    markdownRows.push(`| ${header.join(' | ')} |`);

    // Separator row
    markdownRows.push(`| ${header.map(() => '---').join(' | ')} |`);

    // Data rows
    for (let i = 1; i < normalizedRows.length; i++) {
      const row = normalizedRows[i];
      if (row) {
        markdownRows.push(`| ${row.join(' | ')} |`);
      }
    }

    return `\n${markdownRows.join('\n')}\n`;
  }
}

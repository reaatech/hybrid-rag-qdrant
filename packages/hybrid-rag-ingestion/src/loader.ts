/**
 * Multi-format document loading
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Document } from '@reaatech/hybrid-rag';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import { PDFParse } from 'pdf-parse';

/**
 * Custom error for unsupported formats
 */
export class UnsupportedFormatError extends Error {
  constructor(format: string) {
    super(`Unsupported document format: ${format}`);
    this.name = 'UnsupportedFormatError';
  }
}

/**
 * Custom error for file size exceeded
 */
export class FileSizeExceededError extends Error {
  constructor(size: number, limit: number) {
    super(`File size ${size} bytes exceeds limit of ${limit} bytes`);
    this.name = 'FileSizeExceededError';
  }
}

/**
 * Custom error for document parse failures
 */
export class DocumentParseError extends Error {
  public partialContent: string | undefined;

  constructor(message: string, partialContent?: string) {
    super(message);
    this.name = 'DocumentParseError';
    this.partialContent = partialContent;
  }
}

/**
 * Options for document loading
 */
export interface DocumentLoaderOptions {
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Whether to extract metadata (default: true) */
  extractMetadata?: boolean;
  /** Supported formats (default: all) */
  supportedFormats?: string[];
}

/**
 * Metadata extractor interface
 */
interface _MetadataExtractor {
  extract(filePath: string, content: string): Record<string, unknown>;
}

/**
 * Multi-format document loader
 */
export class DocumentLoader {
  private readonly maxFileSize: number;
  private readonly extractMetadata: boolean;
  private readonly supportedFormats: Set<string>;

  constructor(options: DocumentLoaderOptions = {}) {
    this.maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB default
    this.extractMetadata = options.extractMetadata ?? true;
    this.supportedFormats = new Set(
      options.supportedFormats ?? ['pdf', 'md', 'html', 'htm', 'txt', 'text'],
    );
  }

  /**
   * Load a document from a file path
   */
  async load(filePath: string): Promise<Document> {
    const resolvedPath = path.resolve(filePath);

    // Validate file exists
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    // Check file size
    const stats = fs.statSync(resolvedPath);
    if (stats.size > this.maxFileSize) {
      throw new FileSizeExceededError(stats.size, this.maxFileSize);
    }

    // Get file extension
    const ext = path.extname(resolvedPath).toLowerCase().slice(1);
    if (!this.supportedFormats.has(ext)) {
      throw new UnsupportedFormatError(ext);
    }

    // Read file content
    const buffer = await fs.promises.readFile(resolvedPath);

    // Parse based on format
    let content: string;
    let metadata: Record<string, unknown> = {};

    switch (ext) {
      case 'pdf':
        content = await this.parsePdf(buffer);
        break;
      case 'md':
        content = await this.parseMarkdown(buffer);
        break;
      case 'html':
      case 'htm':
        content = await this.parseHtml(buffer);
        break;
      case 'txt':
      case 'text':
        content = await this.parseText(buffer);
        break;
      default:
        throw new UnsupportedFormatError(ext);
    }

    // Extract metadata if enabled
    if (this.extractMetadata) {
      metadata = this.extractFileMetadata(resolvedPath, content, stats);
    }

    // Generate document ID and content hash
    const contentHash = createHash('sha256').update(content).digest('hex');
    const id = `doc-${contentHash.slice(0, 16)}`;

    return {
      id,
      content,
      source: resolvedPath,
      contentHash,
      fileSize: stats.size,
      contentType: this.getMimeType(ext),
      metadata,
    };
  }

  /**
   * Load multiple documents
   */
  async loadBatch(filePaths: string[]): Promise<Document[]> {
    const documents: Document[] = [];
    const errors: Error[] = [];

    for (const filePath of filePaths) {
      try {
        const doc = await this.load(filePath);
        documents.push(doc);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length > 0 && documents.length === 0) {
      throw new AggregateError(errors, 'Failed to load all documents');
    }

    return documents;
  }

  /**
   * Parse PDF content
   */
  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      const pdf = new PDFParse({ data: buffer });
      const result = await pdf.getText();
      return result.text;
    } catch (error) {
      throw new DocumentParseError(`Failed to parse PDF: ${(error as Error).message}`);
    }
  }

  /**
   * Parse Markdown content
   */
  private async parseMarkdown(buffer: Buffer): Promise<string> {
    const text = buffer.toString('utf-8');
    // Extract plain text from markdown (strip formatting)
    const tokens = marked.lexer(text);
    return this.tokensToText(tokens);
  }

  /**
   * Parse HTML content
   */
  private async parseHtml(buffer: Buffer): Promise<string> {
    const html = buffer.toString('utf-8');
    const $ = cheerio.load(html);

    // Remove script and style elements
    $('script, style, nav, footer, header').remove();

    // Extract main content if available
    const main = $('main, article, .content, .main').first();
    const content = main.length > 0 ? main.text() : $('body').text();

    return content.trim();
  }

  /**
   * Parse plain text content
   */
  private async parseText(buffer: Buffer): Promise<string> {
    // Try UTF-8 first, fall back to other encodings
    try {
      return buffer.toString('utf-8');
    } catch {
      return buffer.toString('latin1');
    }
  }

  /**
   * Convert markdown tokens to plain text
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokensToText(tokens: any): string {
    const parts: string[] = [];

    for (const token of tokens) {
      switch (token.type) {
        case 'heading':
          if (token.depth <= 3) {
            parts.push(
              `\n${'#'.repeat(token.depth)} ${this.extractTextFromTokens(token.tokens)}\n`,
            );
          }
          break;
        case 'paragraph':
          parts.push(this.extractTextFromTokens(token.tokens));
          break;
        case 'list':
          parts.push(
            this.extractTextFromTokens(
              token.items.flatMap((item: unknown) => (item as { tokens?: unknown[] }).tokens ?? []),
            ),
          );
          break;
        case 'text':
          parts.push(token.text);
          break;
        case 'code':
          parts.push(`\n\`\`\`\n${token.text}\n\`\`\`\n`);
          break;
        default:
          if ('tokens' in token && token.tokens) {
            parts.push(this.extractTextFromTokens(token.tokens));
          }
      }
    }

    return parts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Extract text from token array
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractTextFromTokens(tokens: any[] | undefined): string {
    if (!tokens) {
      return '';
    }
    return tokens
      .map((token) => ('text' in token ? (token.text as string) : ''))
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Extract metadata from file
   */
  private extractFileMetadata(
    filePath: string,
    content: string,
    stats: fs.Stats,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      filename: path.basename(filePath),
      extension: path.extname(filePath).slice(1),
      fileSize: stats.size,
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
      wordCount: content.split(/\s+/).filter(Boolean).length,
      charCount: content.length,
    };

    // Try to extract title from content
    const lines = content.split('\n');
    if (lines.length > 0) {
      const firstLine = lines[0]?.trim();
      if (firstLine?.startsWith('#')) {
        metadata.title = firstLine.replace(/^#+\s*/, '');
      }
    }

    return metadata;
  }

  /**
   * Get MIME type for file extension
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      md: 'text/markdown',
      html: 'text/html',
      htm: 'text/html',
      txt: 'text/plain',
      text: 'text/plain',
    };
    return mimeTypes[ext] ?? 'application/octet-stream';
  }
}

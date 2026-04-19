/**
 * Document validation
 */

import { createHash } from 'node:crypto';
import type { Document } from '../types/domain.js';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the document is valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Options for document validation
 */
export interface DocumentValidatorOptions {
  /** Maximum file size in bytes (default: 50MB) */
  maxFileSize?: number;
  /** Minimum content length in characters (default: 100) */
  minContentLength?: number;
  /** Maximum content length in characters (default: 10M) */
  maxContentLength?: number;
  /** Allowed content types */
  allowedContentTypes?: string[];
  /** Whether to check for duplicates (default: true) */
  checkDuplicates?: boolean;
}

/**
 * Document validator
 */
export class DocumentValidator {
  private readonly maxFileSize: number;
  private readonly minContentLength: number;
  private readonly maxContentLength: number;
  private readonly allowedContentTypes: Set<string>;
  private readonly checkDuplicates: boolean;
  private readonly seenContentHashes: Set<string>;
  private static readonly MAX_SEEN_HASHES = 100000;

  constructor(options: DocumentValidatorOptions = {}) {
    this.maxFileSize = options.maxFileSize ?? 50 * 1024 * 1024; // 50MB
    this.minContentLength = options.minContentLength ?? 100;
    this.maxContentLength = options.maxContentLength ?? 10_000_000;
    this.allowedContentTypes = new Set(
      options.allowedContentTypes ?? [
        'application/pdf',
        'text/markdown',
        'text/html',
        'text/plain',
      ],
    );
    this.checkDuplicates = options.checkDuplicates ?? true;
    this.seenContentHashes = new Set();
  }

  /**
   * Validate a document
   */
  validate(document: Document): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!document.id || document.id.trim() === '') {
      errors.push('Document ID is required');
    }

    if (!document.content || document.content.trim() === '') {
      errors.push('Document content is required');
      return { isValid: false, errors, warnings };
    }

    // Validate file size
    if (document.fileSize !== undefined && document.fileSize > this.maxFileSize) {
      errors.push(
        `File size ${document.fileSize} bytes exceeds maximum ${this.maxFileSize} bytes`,
      );
    }

    // Validate content length
    const contentLength = document.content.length;
    if (contentLength < this.minContentLength) {
      errors.push(
        `Content length ${contentLength} is below minimum ${this.minContentLength} characters`,
      );
    }

    if (contentLength > this.maxContentLength) {
      errors.push(
        `Content length ${contentLength} exceeds maximum ${this.maxContentLength} characters`,
      );
    }

    // Validate content type
    if (
      document.contentType &&
      !this.allowedContentTypes.has(document.contentType)
    ) {
      errors.push(`Content type '${document.contentType}' is not allowed`);
    }

    // Check for duplicates
    if (this.checkDuplicates) {
      const contentHash =
        document.contentHash ??
        createHash('sha256').update(document.content).digest('hex');

      if (this.seenContentHashes.has(contentHash)) {
        errors.push('Document content is a duplicate of a previously ingested document');
      } else {
        this.seenContentHashes.add(contentHash);
        if (this.seenContentHashes.size > DocumentValidator.MAX_SEEN_HASHES) {
          const iter = this.seenContentHashes.values();
          for (let i = 0; i < DocumentValidator.MAX_SEEN_HASHES / 2; i++) { iter.next(); }
          for (let i = 0; i < DocumentValidator.MAX_SEEN_HASHES / 2; i++) { const v = iter.next().value; if (v) { this.seenContentHashes.delete(v); } }
        }
      }
    }

    // Warnings

    // Warn if no title
    if (!document.title) {
      warnings.push('Document has no title');
    }

    // Warn if content seems very short
    if (contentLength < 500) {
      warnings.push('Document content is very short (< 500 characters)');
    }

    // Warn if no metadata
    if (!document.metadata || Object.keys(document.metadata).length === 0) {
      warnings.push('Document has no metadata');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate multiple documents
   */
  validateBatch(documents: Document[]): Array<{ document: Document; result: ValidationResult }> {
    return documents.map(document => ({
      document,
      result: this.validate(document),
    }));
  }

  /**
   * Reset the duplicate tracking
   */
  reset(): void {
    this.seenContentHashes.clear();
  }

  /**
   * Check if content is valid text (not binary)
   */
  static isValidTextContent(content: string): boolean {
    // Check for null bytes (common in binary files)
    if (content.includes('\0')) {
      return false;
    }

    // Check for reasonable character distribution
    const nonPrintable = content.replace(/[\p{L}\p{N}\p{P}\p{S}\s]/gu, '').length;
    const nonPrintableRatio = content.length > 0 ? nonPrintable / content.length : 0;
    return nonPrintableRatio < 0.3; // Less than 10% non-printable
  }

  /**
   * Detect encoding of a buffer
   */
  static detectEncoding(buffer: Buffer): BufferEncoding {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return 'utf-8';
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return 'utf-16le';
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
      return 'utf-16be' as BufferEncoding;
    }

    return 'utf-8';
  }
}

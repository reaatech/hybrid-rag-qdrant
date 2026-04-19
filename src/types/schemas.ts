/**
 * Zod schemas for validation
 */

import { z } from 'zod';

// ============================================================================
// Document Schemas
// ============================================================================

/**
 * Schema for Document validation
 */
export const DocumentSchema = z.object({
  id: z.string().min(1, 'Document ID is required'),
  content: z.string().min(1, 'Document content is required'),
  source: z.string().url().or(z.string().startsWith('/')),
  title: z.string().optional(),
  author: z.string().optional(),
  date: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  contentHash: z.string().optional(),
  fileSize: z.number().positive().optional(),
  contentType: z.string().optional(),
});

export type DocumentInput = z.infer<typeof DocumentSchema>;

// ============================================================================
// Chunk Schemas
// ============================================================================

/**
 * Schema for Chunk validation
 */
export const ChunkSchema = z.object({
  id: z.string().min(1, 'Chunk ID is required'),
  documentId: z.string().min(1, 'Document ID is required'),
  index: z.number().int().nonnegative(),
  content: z.string().min(1, 'Chunk content is required'),
  embedding: z.array(z.number()).optional(),
  tokenCount: z.number().int().positive(),
  characterCount: z.number().int().positive(),
  startPosition: z.number().int().nonnegative(),
  endPosition: z.number().int().positive(),
  metadata: z.record(z.unknown()).default({}),
  strategy: z.enum(['fixed-size', 'semantic', 'recursive', 'sliding-window']),
});

export type ChunkInput = z.infer<typeof ChunkSchema>;

/**
 * Schema for ChunkingConfig validation
 */
export const ChunkingConfigSchema = z.object({
  strategy: z.enum(['fixed-size', 'semantic', 'recursive', 'sliding-window']),
  chunkSize: z.number().int().positive().default(512),
  overlap: z.number().int().nonnegative().default(50),
  seed: z.number().int().optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  separators: z.array(z.string()).optional(),
  windowSize: z.number().int().positive().optional(),
  stride: z.number().int().positive().optional(),
});

export type ChunkingConfigInput = z.infer<typeof ChunkingConfigSchema>;

// ============================================================================
// Evaluation Schemas
// ============================================================================

/**
 * Schema for EvaluationSample validation
 */
export const EvaluationSampleSchema = z.object({
  query_id: z.string().min(1, 'Query ID is required'),
  query: z.string().min(1, 'Query text is required'),
  relevant_docs: z.array(z.string()).min(1, 'At least one relevant doc is required'),
  relevant_chunks: z.array(z.string()).min(1, 'At least one relevant chunk is required'),
  ideal_answer: z.string().optional(),
});

export type EvaluationSampleInput = z.infer<typeof EvaluationSampleSchema>;

// ============================================================================
// Ablation Schemas
// ============================================================================

/**
 * Schema for AblationConfig validation
 */
export const AblationConfigSchema = z.object({
  baseline: z.object({
    chunking: z.string().default('fixed-size'),
    chunkSize: z.number().int().positive().default(512),
  overlap: z.number().int().nonnegative().default(50),
    retrieval: z.string().default('hybrid'),
    vectorWeight: z.number().min(0).max(1).default(0.7),
    bm25Weight: z.number().min(0).max(1).default(0.3),
    reranker: z.string().nullable().default(null),
    topK: z.number().int().positive().default(10),
  }),
  variants: z.array(
    z.object({
      name: z.string().min(1, 'Variant name is required'),
      description: z.string().optional(),
      changes: z.object({
        chunking: z.string().optional(),
        chunkSize: z.number().int().positive().optional(),
        overlap: z.number().int().nonnegative().optional(),
        retrieval: z.string().optional(),
        vectorWeight: z.number().min(0).max(1).optional(),
        bm25Weight: z.number().min(0).max(1).optional(),
        reranker: z.string().nullable().optional(),
        topK: z.number().int().positive().optional(),
      }),
    }),
  ),
});

export type AblationConfigInput = z.infer<typeof AblationConfigSchema>;

// ============================================================================
// Retrieval Schemas
// ============================================================================

/**
 * Schema for VectorQuery validation
 */
export const VectorQuerySchema = z.object({
  vector: z.array(z.number()).min(1, 'Vector is required'),
  topK: z.number().int().positive().default(10),
  distance: z.enum(['cosine', 'euclidean', 'dot']).optional(),
  filter: z.record(z.unknown()).optional(),
  collection: z.string().optional(),
});

export type VectorQueryInput = z.infer<typeof VectorQuerySchema>;

/**
 * Schema for BM25Query validation
 */
export const BM25QuerySchema = z.object({
  query: z.string().min(1, 'Query text is required'),
  topK: z.number().int().positive().default(10),
  k1: z.number().positive().default(1.2),
  b: z.number().min(0).max(1).default(0.75),
  filter: z.record(z.unknown()).optional(),
});

export type BM25QueryInput = z.infer<typeof BM25QuerySchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate and parse a document
 */
export function validateDocument(data: unknown): DocumentInput {
  return DocumentSchema.parse(data);
}

/**
 * Validate and parse a chunk
 */
export function validateChunk(data: unknown): ChunkInput {
  return ChunkSchema.parse(data);
}

/**
 * Validate and parse a chunking config
 */
export function validateChunkingConfig(data: unknown): ChunkingConfigInput {
  return ChunkingConfigSchema.parse(data);
}

/**
 * Validate and parse an evaluation sample
 */
export function validateEvaluationSample(data: unknown): EvaluationSampleInput {
  return EvaluationSampleSchema.parse(data);
}

/**
 * Validate and parse an ablation config
 */
export function validateAblationConfig(data: unknown): AblationConfigInput {
  return AblationConfigSchema.parse(data);
}

/**
 * Validate and parse a vector query
 */
export function validateVectorQuery(data: unknown): VectorQueryInput {
  return VectorQuerySchema.parse(data);
}

/**
 * Validate and parse a BM25 query
 */
export function validateBM25Query(data: unknown): BM25QueryInput {
  return BM25QuerySchema.parse(data);
}
